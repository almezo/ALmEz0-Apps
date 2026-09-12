
const fs = require("fs");
const p = "d:\\My File\\ALmEz0\\1- Publishing site\\staff.js";
let content = fs.readFileSync(p, "utf8");

// Split by the main marker
const marker = "document.addEventListener('DOMContentLoaded'";
const parts = content.split(marker);

// The last part is what we want, but we need to re-attach the marker and any comments before it.
// If the file is triplicated, it will have multiple occurrences.
if (parts.length > 2) {
    let lastPart = marker + parts[parts.length - 1];
    
    // We should also prepend the comment block
    const commentBlock = "// =============================================\r\n// ???? ???? ???????? ???????? (Staff Sales Dashboard)\r\n// =============================================\r\n\r\n";
    let finalContent = commentBlock + lastPart;
    
    fs.writeFileSync(p, finalContent, "utf8");
    console.log("Success! File cleaned. New length: " + finalContent.split("\n").length + " lines.");
} else {
    console.log("Only found " + parts.length + " parts.");
}

