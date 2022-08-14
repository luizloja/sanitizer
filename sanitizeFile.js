if (process.argv.length >= 4) {
    let sanitizerObject = process.argv[2]
    let filePath = process.argv[3]
    const sanitizer = await
    import (`./models/jsonSanitizers/${sanitizerObject}.js`);

    sanitizer.default.sanitizeFile(filePath)
} else {
    console.log(" WARNING WARNING WARNING\n It is necessary to specify the Sanitizer and the File.\n The sanitizer file must be on models/jsonSanitizers/nameOfYourSanitizer.js.\n Example: npm run sanitize shopifyOrders /usr/src/app/models/jsonSanitizers/ordersToReProcess.json ")
}