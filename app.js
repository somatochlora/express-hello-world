const fs = require('fs');
const cron = require('node-cron');

const eBirdKey = process.env.EBIRD_API_KEY;
const ntfyURL = process.env.NTFY_URL;

async function fetchEbirdResults (location) {
  let results = await fetch("https://api.ebird.org/v2/product/lists/" + location + "?key=" + eBirdKey + "&maxResults=200");
  return await results.json();
}

cron.schedule('0 * * * *', () => {
  let config = JSON.parse(fs.readFileSync('config.json'));
  let lastResults = JSON.parse(fs.readFileSync('savedResults.json'));
  
  let locations = config.locations;
  let savedChecklists = {}
  let toEmail = [];
  let promisesArray = [];
  
  for (let location of locations) {
    let curLocationToSave = {
        checklists:[]
    }
    savedChecklists[location.id] = curLocationToSave;
  
    let eBirdResults = fetchEbirdResults(location.id)
    promisesArray.push(eBirdResults);
    eBirdResults.then(results => {
        results.forEach(checklist => {
           curLocationToSave.checklists.push(checklist.subId); 
        });
  
        if (lastResults.hasOwnProperty(location.id)) {
            results = results.filter(checklist => {
                return lastResults[location.id].checklists.indexOf(checklist.subId) == -1
            });
        }
  
        results.forEach(checklist => {
            toEmail.push(checklist);
        });
    });
  }
  
  Promise.all(promisesArray).then(() => {
    if (toEmail.length > 0) {
        console.log("new results found");
        let allOutput = ""
        toEmail.forEach(checklist => {
            let output = 
                "Location: " +
                checklist.loc.name +        
                " Observer: " +
                checklist.userDisplayName +
                ", " +
                checklist.numSpecies +
                " species observed, " +
                checklist.obsDt +
                " " +
                checklist.obsTime +
                " https://ebird.org/checklist/" +
                checklist.subId;
            console.log(output);
            allOutput += output + "\n";
        });
        fetch(
            'http://ntfy.sh/reuven-ebird-alerts',
            {
                method: 'POST',
                body: allOutput
            }
        );
    }
    
    fs.writeFileSync('savedResults.json', JSON.stringify(savedChecklists, null, 2));
  });
});

