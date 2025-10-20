/*\
Title: $:/plugins/jjkavalam/footype/edit-foo.js
Type: application/javascript
module-type: widget

A simple custom editor for tiddlers of type application/x-foo.
The editor is invoked via <$edit> when mapping is set to 'foo'.
Exports widget name: edit-foo

Features:
- Renders a button to open a modal with an iframe (example.com) for demo
- When the modal "Done" button is pressed, it writes SVG into the tiddler text
- The editor previews by rendering the tiddler.text as an SVG (via data URI),
  falling back to a placeholder when empty
\*/

"use strict";

var Widget = require("$:/core/modules/widgets/widget.js").widget;

function EditFooWidget(parseTreeNode,options) {
	this.initialise(parseTreeNode,options);
}

EditFooWidget.prototype = new Widget();

EditFooWidget.prototype.render = function(parent,nextSibling) {
	this.parentDomNode = parent;
	this.computeAttributes();
	this.execute();
	this.renderChildren(parent,nextSibling);
};

EditFooWidget.prototype.execute = function() {
	var editTitle = this.getAttribute("tiddler",this.getVariable("currentTiddler"));
	var tiddler = this.wiki.getTiddler(editTitle);
	var svgText = tiddler && tiddler.fields.text ? tiddler.fields.text : "";
	var hasSVG = /<svg[\s>]/i.test(svgText);
	var placeholderText = this.wiki.getTiddlerText("$:/plugins/jjkavalam/footype/images/placeholder","");
	var svgForPreview = hasSVG ? svgText : placeholderText;
	var dataUri = svgForPreview ? ("data:image/svg+xml;utf8," + encodeURIComponent(svgForPreview)) : "";

	// Build a button that opens our modal and passes the current tiddler title via <$action-sendmessage>
	var openButton = {
		type: "button",
		attributes: {
			"aria-label": { type: "string", value: "Open diagram editor" },
			class: { type: "string", value: "tc-btn tc-btn-primary tc-footype-open" }
		},
		children: [
			{ type: "text", text: "Open Diagram Editor" },
			{ type: "action-sendmessage",
			  attributes: {
				$message: { type: "string", value: "tm-modal" },
				$param: { type: "string", value: "$:/plugins/jjkavalam/footype/ui/DiagramModal" },
				diagramTiddler: { type: "string", value: editTitle }
			  } }
		]
	};

	// Preview area: render tiddler.text (SVG) via data URI, fallback to placeholder
	var previewArea;
	if(dataUri) {
		previewArea = {
			type: "element",
			tag: "div",
			attributes: { class: { type: "string", value: "tc-footype-preview" } },
			children: [
				{
					type: "element",
					tag: "img",
					attributes: {
						src: { type: "string", value: dataUri },
						class: { type: "string", value: "tc-footype-preview-image" },
						alt: { type: "string", value: "Diagram preview" }
					}
				}
			]
		};
	} else {
		previewArea = {
			type: "element",
			tag: "div",
			attributes: { class: { type: "string", value: "tc-footype-preview tc-footype-preview-empty" } },
			children: [ { type: "text", text: "No preview yet. Click 'Open Diagram Editor'." } ]
		};
	}

	this.makeChildWidgets([
		{
			type: "element",
			tag: "div",
			attributes: { class: { type: "string", value: "tc-footype-editor" } },
			children: [ openButton, previewArea ]
		}
	]);
};

EditFooWidget.prototype.refresh = function(changedTiddlers) {
	var changedAttributes = this.computeAttributes();
	if(changedAttributes.tiddler) {
		this.refreshSelf();
		return true;
	}
	var editTitle = this.getAttribute("tiddler",this.getVariable("currentTiddler"));
	if(changedTiddlers[editTitle] || changedTiddlers["$:/plugins/jjkavalam/footype/images/placeholder"]) {
		this.refreshSelf();
		return true;
	}
	return this.refreshChildren(changedTiddlers);
};

exports["edit-foo"] = EditFooWidget;
