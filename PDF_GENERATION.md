# PDF Generation in DXF PRO

## Overview

DXF PRO uses the html2pdf.js library to generate PDF reports with full Cyrillic text support. This document explains how the PDF generation works and how to troubleshoot common issues.

## How It Works

1. **Library Loading**: The application dynamically loads the html2pdf.js library from a CDN when needed
2. **HTML Generation**: Report data is converted to HTML with proper styling
3. **PDF Conversion**: The HTML content is converted to PDF using html2pdf.js
4. **Download**: The generated PDF is automatically downloaded to the user's computer

## Troubleshooting Blank PDFs

If you're experiencing blank PDFs, check the following:

### 1. Internet Connection
The html2pdf.js library is loaded from a CDN. Ensure you have a stable internet connection.

### 2. Browser Console
Open the browser's developer tools (F12) and check the console for error messages.

### 3. Data Validation
Ensure that you have:
- Loaded DXF files
- Performed nesting calculations
- Have valid calculation data

### 4. Library Loading Issues
If the library fails to load, the application will show an error message. Try refreshing the page.

## Technical Details

### Files Involved
- `pdf-export-html2pdf.js` - Main PDF generation module
- `main.js` - UI integration and event handling
- `pdf-test.html` - Test page for PDF functionality

### Key Functions
- `generatePDFReport()` - Main PDF generation function
- `preloadHtml2PDF()` - Preloads the library for better performance
- `createReportHTML()` - Converts data to HTML format

### Error Handling
The system includes comprehensive error handling:
- Library loading failures
- Data validation errors
- PDF generation errors
- Network issues

## Common Issues and Solutions

### "Blank PDF" Error
This usually occurs when:
1. No data is available for the report
2. The html2pdf.js library failed to load
3. Content is not properly rendered before PDF generation

**Solution**: 
- Ensure you have loaded files and performed calculations
- Check the browser console for errors
- Refresh the page to reload libraries

### Cyrillic Text Issues
All text should display correctly in Cyrillic. If you see question marks or strange characters:
1. Ensure you're using a modern browser
2. Check that the html2pdf.js library loaded correctly

### Performance Issues
For large reports:
- PDF generation may take a few seconds
- The UI will show loading indicators
- Avoid closing the browser tab during generation

## Testing

To test PDF functionality:
1. Open `pdf-test.html` in your browser
2. Click the "Сгенерировать тестовый PDF" button
3. Check that a PDF file is downloaded with Cyrillic text

## Support

If you continue to experience issues:
1. Check the browser console for detailed error messages
2. Ensure you're using a modern browser (Chrome, Firefox, Edge)
3. Verify your internet connection is stable
4. Try refreshing the page to reload all resources