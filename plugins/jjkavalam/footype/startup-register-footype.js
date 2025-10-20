/*\
Title: $:/plugins/jjkavalam/footype/startup-register-footype.js
Type: application/javascript
module-type: startup

Registers the application/x-foo content type with TiddlyWiki at startup.
\*/

"use strict";

exports.name = "register-footype";
exports.after = ["load-modules"];
exports.synchronous = true;

exports.startup = function() {
	if($tw && $tw.utils && $tw.utils.registerFileType) {
		// Register our custom content type
		// - encoding: utf8 (text), so default edit fallback is text
		// - extension: .foo
		// - deserializerType: text/plain (parse as plain text)
		$tw.utils.registerFileType("application/x-foo","utf8",".foo",{deserializerType:"text/plain"});
	}
};
