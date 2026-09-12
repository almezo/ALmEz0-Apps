
$content = Get-Content "d:\My File\ALmEz0\1- Publishing site\staff.js" -Raw
$pattern = "(?s)// =============================================\r?\n// ???? ???? ???????? ???????? \(Staff Sales Dashboard\)\r?\n// =============================================\r?\n\r?\ndocument\.addEventListener\('DOMContentLoaded', \(\) => \{"
$matches = [regex]::Matches($content, $pattern)
if ($matches.Count -gt 0) {
    $lastMatch = $matches[$matches.Count - 1]
    $cleanContent = $content.Substring($lastMatch.Index)
    Set-Content -Path "d:\My File\ALmEz0\1- Publishing site\staff.js" -Value $cleanContent -Encoding UTF8
    Write-Host "Success: $($matches.Count) matches found. Cleaned."
} else {
    Write-Host "Pattern not found."
}

