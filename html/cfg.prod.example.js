let DATA_URL = './data/data.json'
let REPO_URL = 'https://github.com/dptabor/flowbat-stability-viz'

var dataPromise = new Promise((resolve, reject) => {
      d3.json(DATA_URL + "?" + Math.random(), function onLoadData (records) {
            let formattedData = {
                  stability_window: records['stability_window'][0],
                        molecules: records['molecule'],
                            }
                                resolve(formattedData)
                                  })
      })

function _parseData (data) {
    let errors = []
        let records = {}
      for (let record of data.records) {
            let recordType = record[0]
                  if (!recordType) { continue }
                try {
                        if (!records[recordType]) {
                                  records[recordType] = []
                                          }
                              let parsedRecord = JSON.parse(record[1])
                                      records[recordType].push(parsedRecord)
                                          } catch (err) {
                                                  errors.push({err, record})
                                                        }
                  }
        return {errors, records}
}

function renderDataSource () {
    return `DataSource: <a target="_blank" href="${DATA_URL}">${DATA_URL}</a>`
}

function renderRepo () {
    return `Code Repository: <a target="_blank" href="${REPO_URL}">${REPO_URL}</a>`
}

var CFG = {
    dataPromise,
      renderDataSource,
        renderRepo,
}
