/* JSB Fleet Ops — native bridge for the Android app.
 * Inside the app's WebView, browser downloads, window.print() and
 * window.open(blob:) do nothing. This file reroutes them:
 *   - every "download" (PDF, XLS, JPG, JSON backup) is saved to
 *     Documents/JSB Fleet on the phone, then the share sheet opens
 *     (WhatsApp, Drive, email, Files...)
 *   - window.print() renders the print view to a PDF and shares it
 *   - opening a PDF attachment shares/opens it with the phone's PDF viewer
 * In a normal browser this file does nothing at all.
 */
(function () {
  "use strict";
  var Cap = window.Capacitor;
  if (!Cap || !Cap.isNativePlatform || !Cap.isNativePlatform()) return;

  var P = Cap.Plugins || {};
  var FOLDER = "JSB Fleet";

  function note(msg) {
    try { if (typeof window.toast === "function") { window.toast(msg); return; } } catch (e) {}
    console.log(msg);
  }

  function blobToBase64(blob) {
    return new Promise(function (res, rej) {
      var r = new FileReader();
      r.onload = function () { res(String(r.result).split(",")[1] || ""); };
      r.onerror = function () { rej(r.error); };
      r.readAsDataURL(blob);
    });
  }

  function safeName(name) {
    return String(name || "file").replace(/[\\/:*?"<>|]+/g, "_").trim() || "file";
  }

  /* Save a Blob and open the share sheet. */
  function saveAndShare(blob, name) {
    name = safeName(name);
    var FS = P.Filesystem, SH = P.Share;
    if (!FS) { note("File saving isn't available in this build."); return Promise.resolve(); }
    return blobToBase64(blob).then(function (b64) {
      // 1) A copy the share sheet can read (always works)
      return FS.writeFile({ path: name, data: b64, directory: "CACHE" }).then(function (cached) {
        // 2) A permanent copy in Documents/JSB Fleet (best effort)
        var keep = FS.writeFile({ path: FOLDER + "/" + name, data: b64, directory: "DOCUMENTS", recursive: true })
          .then(function () { return true; }).catch(function () { return false; });
        return keep.then(function (kept) {
          note(kept ? "Saved to Documents/" + FOLDER + "/" + name : "Ready to share: " + name);
          if (!SH) return;
          return SH.share({ title: name, files: [cached.uri], dialogTitle: "Share or save " + name })
            .catch(function () {
              return SH.share({ title: name, url: cached.uri }).catch(function () {});
            });
        });
      });
    }).catch(function (err) {
      console.error(err);
      note("Couldn't save " + name + ".");
    });
  }

  function urlToBlob(href) {
    return fetch(href).then(function (r) { return r.blob(); });
  }

  function isLocalUrl(href) {
    return /^(blob:|data:)/i.test(String(href || ""));
  }

  /* 1) <a download> clicks — covers XLS, JPG, JSON backups */
  function handleAnchor(a) {
    if (!a || !a.hasAttribute || !a.hasAttribute("download")) return false;
    var href = a.href;
    if (!isLocalUrl(href)) return false;
    var name = a.getAttribute("download") || "download";
    urlToBlob(href).then(function (b) { return saveAndShare(b, name); });
    return true;
  }

  var origClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    if (handleAnchor(this)) return;
    return origClick.apply(this, arguments);
  };

  var origDispatch = HTMLAnchorElement.prototype.dispatchEvent;
  HTMLAnchorElement.prototype.dispatchEvent = function (ev) {
    if (ev && ev.type === "click" && handleAnchor(this)) return false;
    return origDispatch.apply(this, arguments);
  };

  document.addEventListener("click", function (ev) {
    var a = ev.target && ev.target.closest ? ev.target.closest("a[download]") : null;
    if (a && handleAnchor(a)) { ev.preventDefault(); ev.stopPropagation(); }
  }, true);

  /* 2) jsPDF doc.save(...) — fuel reports and work orders */
  function patchJsPDF() {
    var J = window.jspdf && window.jspdf.jsPDF;
    if (!J || !J.API || J.API.__jsbPatched) return;
    J.API.save = function (filename) {
      var name = filename || "document.pdf";
      if (!/\.pdf$/i.test(name)) name += ".pdf";
      saveAndShare(this.output("blob"), name);
      return this;
    };
    J.API.__jsbPatched = true;
  }
  patchJsPDF();
  window.addEventListener("DOMContentLoaded", patchJsPDF);

  /* 3) window.open(blob:/data:) — viewing PDF attachments */
  var origOpen = window.open;
  window.open = function (url) {
    if (isLocalUrl(url)) {
      urlToBlob(url).then(function (b) {
        var ext = (b.type === "application/pdf") ? ".pdf" : "";
        return saveAndShare(b, "Attachment_" + Date.now() + ext);
      });
      return null;
    }
    return origOpen.apply(window, arguments);
  };

  /* 4) window.print() — render the print view to a PDF instead */
  window.print = function () {
    var area = document.getElementById("printArea");
    var J = window.jspdf && window.jspdf.jsPDF;
    var finish = function () { try { window.dispatchEvent(new Event("afterprint")); } catch (e) {} };
    if (!area || !J || !window.html2canvas) { note("Printing isn't available offline."); finish(); return; }
    note("Preparing PDF…");
    var prevW = area.style.width, prevBg = area.style.background;
    area.style.width = "1100px";
    area.style.background = "#ffffff";
    window.html2canvas(area, { scale: 2, backgroundColor: "#ffffff", windowWidth: 1100, useCORS: true })
      .then(function (canvas) {
        var pdf = new J({ orientation: "l", unit: "mm", format: "letter" });
        var margin = 8;
        var pageW = pdf.internal.pageSize.getWidth() - margin * 2;
        var pageH = pdf.internal.pageSize.getHeight() - margin * 2;
        var pxPerMm = canvas.width / pageW;
        var slicePx = Math.floor(pageH * pxPerMm);
        var y = 0, first = true;
        while (y < canvas.height) {
          var h = Math.min(slicePx, canvas.height - y);
          var part = document.createElement("canvas");
          part.width = canvas.width; part.height = h;
          part.getContext("2d").drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h);
          if (!first) pdf.addPage();
          pdf.addImage(part.toDataURL("image/jpeg", 0.92), "JPEG", margin, margin, pageW, h / pxPerMm);
          first = false;
          y += h;
        }
        var title = (document.querySelector("#printArea h1") || {}).textContent || "JSB_Report";
        var name = "JSB_" + title.replace(/\s+/g, "_").slice(0, 60) + "_" + new Date().toISOString().slice(0, 10) + ".pdf";
        return saveAndShare(pdf.output("blob"), name);
      })
      .catch(function (err) { console.error(err); note("Couldn't create the PDF."); })
      .then(function () { area.style.width = prevW; area.style.background = prevBg; finish(); });
  };

  /* Android back button: close open overlays first, then go back / exit */
  var App = P.App;
  if (App && App.addListener) {
    App.addListener("backButton", function (e) {
      var ids = ["miniOverlay", "modalOverlay", "ovl"];
      for (var i = 0; i < ids.length; i++) {
        var el = document.getElementById(ids[i]);
        if (el && el.style.display !== "none") {
          try {
            if (ids[i] === "miniOverlay" && window.miniClose) window.miniClose();
            else if (ids[i] === "modalOverlay" && window.modalCloseAndRefresh) window.modalCloseAndRefresh();
            else if (window.ovClose) window.ovClose();
            else el.style.display = "none";
          } catch (err) { el.style.display = "none"; }
          return;
        }
      }
      if (e && e.canGoBack) window.history.back(); else App.exitApp();
    });
  }
})();
