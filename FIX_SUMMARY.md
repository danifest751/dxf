# PDF Export Function Name Typo Fix

## 🐛 Issue Description

There was a critical typo in the PDF export functionality that caused the following error:
```
pdf-export.js:381 PDF generation error: ReferenceError: ensureJsPDFAvailable is not defined
    at generatePDFReport (pdf-export.js:287:5)
    at HTMLButtonElement.<anonymous> (main.js:1800:13)
```

## 🔧 Root Cause

In the [generatePDFReport](file:///c%3A/calc/pdf-export.js#L278-L392) function, there was an incorrect function call:
```javascript
// Incorrect function name
await ensureJsPDFAvailable();
```

The correct function name is [ensureJsPDFLoaded](file:///c%3A/calc/pdf-export.js#L29-L74), which is defined in the same file.

## ✅ Fix Applied

Changed the incorrect function call from `ensureJsPDFAvailable` to [ensureJsPDFLoaded](file:///c%3A/calc/pdf-export.js#L29-L74):
```javascript
// Corrected function name
await ensureJsPDFLoaded();
```

## 📋 Files Modified

1. **pdf-export.js** - Fixed the function name typo in the [generatePDFReport](file:///c%3A/calc/pdf-export.js#L278-L392) function

## 🧪 Verification

1. Checked that all references to the function use the correct name [ensureJsPDFLoaded](file:///c%3A/calc/pdf-export.js#L29-L74)
2. Verified that the function is properly defined
3. Created test file to verify the fix
4. Confirmed no syntax errors in the updated file

## 🚀 Result

The PDF export functionality should now work correctly without the "ReferenceError: ensureJsPDFAvailable is not defined" error. The function name typo has been fixed, and the PDF generation process should proceed normally.

## 📝 Additional Notes

This fix resolves the immediate error that was preventing PDF generation. The Russian text display improvements that were implemented earlier remain in place, ensuring that PDF reports will display actual Cyrillic characters rather than transliterated Latin text.