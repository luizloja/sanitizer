import Mongoose from "mongoose";
import path from "path"
import cliProgress from 'cli-progress'
import fs from 'fs'

export default class Sanitize {
    constructor(collection, schema, filter = {}) {
        this.schema = schema
        this.collection = collection
        this.filter = filter
    }

    getSchema() {
        return new Mongoose.Schema(this.createSchemaJson(this.schema))
    }

    async sanitizeFile(filePathToSanitize, filePathDestenyFile = "./") {
        let fileName = path.basename(filePathToSanitize)
        let fileExtension = path.extname(fileName);
        var fileNameWithoutExtension = path.basename(fileName, fileExtension);

        let jsonSchema = this.createSchemaJson(this.schema);
        let rawdata = fs.readFileSync(filePathToSanitize);
        let jsonData = JSON.parse(rawdata);
        let records = await this.sanitizeRecords(jsonData, jsonSchema)
        fs.writeFileSync(`${filePathDestenyFile}/${fileNameWithoutExtension}Sanitized${fileExtension}`, JSON.stringify(records));
    }

    async sanitizeCollection(mongoConnection) {
        let model = mongoConnection.model(`Model ${this.collection}`, this.getSchema(), this.collection)
        const all = await model.find(this.filter).lean();
        let records = await this.sanitizeRecords(all, model)
        fs.mkdirSync(`data-import/${this.collection}`, { recursive: true })
        let json = this.formatToWriteInFile(records)


        fs.writeFileSync(`data-import/${this.collection}/${this.collection}.json`, json, function(err) {
            if (err) return console.log(err);
        });

    }

    formatToWriteInFile(records) {
        let finalElements = []
            //Change the keys
        records.forEach(element => {
            Object.keys(element).forEach(recordKey => {
                let v = element[recordKey]
                if (v && v.buffer) {
                    element[recordKey] = { "$binary": { "base64": v.buffer.toString('base64'), "subType": "04" } }
                }

                if (v instanceof Date) {
                    element[recordKey] = { "$date": v }
                }

            })
            finalElements.push(element)
        })
        return JSON.stringify(finalElements, null, '\t')
    }

    sanitizeTheRecord(record, schema) {

        Object.keys(schema).forEach(schemaKey => {
            this.filteredKeys(schemaKey, record).forEach(key => {
                if (this.isFunction(schema[schemaKey])) {
                    this.sanitizeValue(record, schema, key, schemaKey)
                } else {
                    if (this.isDefault(schema[schemaKey])) {
                        this.sanitizeValue(record, schema, key, schemaKey)
                    } else if (this.isArray(schema[schemaKey]) && this.isArray(record[key])) {
                        record[key].forEach((arrayValue, index) => {
                            record[key][index] = this.sanitizeTheRecord(arrayValue, schema[schemaKey][0])
                        })
                    } else if (this.isObject(schema[schemaKey]) && this.isObject(record[key])) {
                        record[key] = this.sanitizeTheRecord(record[key], schema[schemaKey])
                    }
                }
            })
        });
        return record
    }

    filteredKeys(schemaKey, record) {
        if (!this.isRegex(schemaKey)) return [schemaKey]
        if (record == null || record == undefined) return []
        let keys = []
        let regExp = new RegExp(schemaKey.split("/")[1])
        Object.keys(record).forEach(recordKey => {
            if (regExp.test(recordKey)) {
                keys.push(recordKey)
            }
        })
        return keys
    }

    sanitizeValue(record, schema, key, schemaKey) {
        if (record && record[key] && !(/^[0-9]+/.test(key))) {
            let defaultFunction = null
            defaultFunction = schema[schemaKey].$default ? schema[schemaKey].$default : schema[schemaKey]
            record[key] = /ˆderive.+$/.test(defaultFunction.name) ? defaultFunction(record) : defaultFunction()
        }
    }

    async sanitizeRecords(records, model) {
        var newRecords = []
        const bar1 = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
        console.log(`Sanitizing ${records.length} ${this.collection} records`)
        bar1.start(records.length, 0);
        records.forEach((record, index) => {
            try {
                this.sanitizeTheRecord(record, this.schema)
                bar1.update(index + 1)
                newRecords.push(record)
            } catch (error) {

            }


        })
        bar1.stop()
        return newRecords
    }

    isType(object, element) {
        return (typeof object == element)
    }

    isFunction(object) {
        return this.isType(object, 'function')
    }

    isArray(object) {
        return object instanceof Array
    }

    isDefault(object) {
        if (object == undefined) return false
        return object["$type"] && object["$default"]
    }

    isObject(object) {
        return object instanceof Object
    }

    isRegex(object) {
        return object.toString().match(/\/.+\//) != null
    }

    createSchemaJson(schema) {
        let jsonSchema = {}
        Object.keys(schema).forEach(key => {
            if (!this.isRegex(key)) {
                if (this.isFunction(schema[key])) {
                    jsonSchema[key] = "string"
                } else {
                    if (this.isDefault(schema[key])) {
                        jsonSchema[key] = schema[key].type
                    } else if (this.isArray(schema[key])) {
                        jsonSchema[key] = []
                        schema[key].forEach(arrayValue => {
                            jsonSchema[key].push(this.createSchemaJson(arrayValue))
                        })
                    } else if (this.isObject(schema[key])) {
                        jsonSchema[key] = this.createSchemaJson(schema[key])
                    }
                }
            }
        });
        return jsonSchema
    }

    print() {
        console.log(this.schema)
    }
}