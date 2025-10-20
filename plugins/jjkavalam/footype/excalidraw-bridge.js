/*\
Title: $:/plugins/jjkavalam/footype/excalidraw-bridge.js
Type: application/javascript
module-type: widget

Embeds an Excalidraw editor in an iframe and bridges data via postMessage.

Attributes:
- tiddler: target tiddler title (defaults to currentTiddler)
- url: iframe src (defaults to https://excalidraw.com/?embed=1)

Behavior:
- On load, if the tiddler.text contains an SVG (with embedded Excalidraw scene), send it to the iframe as {type:"loadScene", svg}
- Listens for {type:"export"} messages with {svg} and writes it into $:/state/footype!!svgBuffer
- Handles message "tm-footype-export" to request export from iframe: postMessage({type:"export", format:"svg"})

Note: When embedding the public https://excalidraw.com, the page may not respond to these messages.
In that case, use the textarea fallback to paste exported SVG manually. This widget keeps the flow robust.
\*/

"use strict";

var Widget = require("$:/core/modules/widgets/widget.js").widget;

function ExcalidrawBridgeWidget(parseTreeNode,options) {
    this.initialise(parseTreeNode,options);
}

ExcalidrawBridgeWidget.prototype = new Widget();

ExcalidrawBridgeWidget.prototype.render = function(parent,nextSibling) {
    this.parentDomNode = parent;
    this.computeAttributes();
    this.execute();

    // Container
    var container = this.document.createElement("div");
    container.className = "tc-footype-iframe";
    container.style.position = "relative";

    // Create iframe
    var iframe = this.document.createElement("iframe");
    iframe.setAttribute("src",this.srcUrl);
    iframe.setAttribute("width","100%");
    iframe.setAttribute("height","100%");
    iframe.setAttribute("style","border:0");
    iframe.setAttribute("referrerpolicy","no-referrer");
    // allow-downloads helps when the embedded app triggers a user-initiated download
    iframe.setAttribute("sandbox","allow-scripts allow-same-origin allow-forms allow-downloads");
    container.appendChild(iframe);

    // No inline toolbar; the embedded app's own Export button will trigger save+close

    this.iframeEl = iframe;
    this._ready = false;

    // Bind listeners
    this._onMessage = this.onMessage.bind(this);
    this._onLoad = this.onLoad.bind(this);
    this.iframeEl.addEventListener("load",this._onLoad,false);
    window.addEventListener("message",this._onMessage,false);

    parent.insertBefore(container,nextSibling);
    this.domNodes.push(container);
};

ExcalidrawBridgeWidget.prototype.execute = function() {
    this.editTitle = this.getAttribute("tiddler",this.getVariable("currentTiddler"));
    var defaultUrl = "https://excalidraw.com/?embed=1";
    this.srcUrl = this.getAttribute("url",defaultUrl);

    // Derive origin for postMessage target
    try {
        this._targetOrigin = new URL(this.srcUrl,this.document.location && this.document.location.href).origin;
    } catch(e) {
        this._targetOrigin = "*";
    }

    var t = this.wiki.getTiddler(this.editTitle);
    // Use the tiddler text (SVG possibly with embedded scene) as the source of truth
    this.svgText = t ? t.getFieldString("text") : "";
    // no-op: debug logs removed
};

ExcalidrawBridgeWidget.prototype.refresh = function(changedTiddlers) {
    var changedAttributes = this.computeAttributes();
    if(changedAttributes.tiddler || changedAttributes.url) {
        return this.refreshSelf();
    }
    return this.refreshChildren(changedTiddlers);
};

ExcalidrawBridgeWidget.prototype.onLoad = function() {
    this._ready = true;
    // no-op
    // If we have SVG in the tiddler text, try to load it
    if(this.svgText && /<svg[\s>]/i.test(this.svgText)) {
        // If only SVG exists (with embedded scene), try to load via SVG
        this.postLoadSVG(this.svgText);
    }
};

ExcalidrawBridgeWidget.prototype.onMessage = function(event) {
    // Filter by origin if possible
    if(this._targetOrigin !== "*" && event.origin !== this._targetOrigin) {
        return;
    }
    var data = event.data;
    if(!data || typeof data !== "object") {
        return;
    }
    if(data.type === "export") {
        // Expect data.svg
        var svg = data.svg || "";
        this.writeSvgBuffer(svg);
        // Persist immediately into the target tiddler and close the modal
        this.saveSvgToTiddler(svg);
        // Close modal dialog
        try { this.dispatchEvent({type: "tm-close-tiddler"}); } catch(e) {}
    } else if(data.type === "ready" || data.type === "loaded") {
        this._ready = true;
        if(this.svgText && /<svg[\s>]/i.test(this.svgText)) {
            this.postLoadSVG(this.svgText);
        }
    }
};

// scene JSON loading removed; we rely on SVG with embedded scene

ExcalidrawBridgeWidget.prototype.postLoadSVG = function(svgText) {
    if(!this.iframeEl || !this.iframeEl.contentWindow) {
        return;
    }
    if(!svgText || typeof svgText !== "string") {
        return;
    }
    var payload = { type: "loadScene", svg: svgText };
    // no-op: debug logs removed
    this.iframeEl.contentWindow.postMessage(payload,this._targetOrigin);
};

ExcalidrawBridgeWidget.prototype.requestExport = function() {
    if(!this.iframeEl || !this.iframeEl.contentWindow) {
        return;
    }
    // Ask for SVG (and hopefully scene if supported)
    this.iframeEl.contentWindow.postMessage({ type: "export", format: "svg" },this._targetOrigin);
};

ExcalidrawBridgeWidget.prototype.writeSvgBuffer = function(svg) {
    var stateTitle = "$:/state/footype";
    var stateTid = this.wiki.getTiddler(stateTitle);
    var fields = {
        title: stateTitle,
        text: (stateTid && stateTid.fields.text) || "",
        type: "text/vnd.tiddlywiki",
        svgBuffer: svg
    };
    this.wiki.addTiddler(new $tw.Tiddler(stateTid,fields));
    // Mark we have a preview
    var previewFlag = this.wiki.getTiddler("$:/state/footype/hasPreview");
    this.wiki.addTiddler(new $tw.Tiddler(previewFlag,{ title: "$:/state/footype/hasPreview", text: "yes" }));
    // no-op
};

ExcalidrawBridgeWidget.prototype.saveSvgToTiddler = function(svg) {
    if(!svg || !this.editTitle) return;
    var existing = this.wiki.getTiddler(this.editTitle);
    var fields = {
        title: this.editTitle,
        type: "application/x-foo",
        text: svg
    };
    // Preserve other fields from the tiddler
    this.wiki.addTiddler(new $tw.Tiddler(existing, fields));
    try { console.log("[footype] saved diagram to", this.editTitle); } catch(e) {}
};

ExcalidrawBridgeWidget.prototype.hasEmbeddedScene = function(svg) {
    if(!svg || typeof svg !== "string") return false;
    // Heuristics for Excalidraw-embedded scene markers
    // Common markers: svg comment, metadata payload, and payload-type
    return /svg-source:excalidraw/.test(svg) ||
           /payload-type:application\/vnd\.excalidraw\+json/.test(svg) ||
           /payload-start/.test(svg);
};

ExcalidrawBridgeWidget.prototype.handleMessage = function(message) {
    if(message && message.type === "tm-footype-export") {
        this.requestExport();
        message.cancelled = true;
        return true;
    }
    return false;
};

ExcalidrawBridgeWidget.prototype.destroy = function() {
    if(this.iframeEl && this._onLoad) {
        this.iframeEl.removeEventListener("load",this._onLoad,false);
    }
    if(this._onMessage) {
        window.removeEventListener("message",this._onMessage,false);
    }
    Widget.prototype.destroy.call(this);
};

exports["footype-excalidraw"] = ExcalidrawBridgeWidget;
