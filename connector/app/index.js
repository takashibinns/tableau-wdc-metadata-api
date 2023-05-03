import Connector from '@tableau/taco-toolkit'

//  Initialize the Connector object
const connector = new Connector(onInitialized);

//  Run when the user input popup launches
function onInitialized() {
  //  Setup the submit button
  const elem = document.getElementById('submitButton')
  elem.innerText = 'Get Data'
  elem.removeAttribute('disabled')

  //  autofill any saved inputs
  setCredential()

  //  Set the focus for the first input box
  document.getElementById('siteUrl').focus()
}

//  Add click handler to the submit button, once the page has loaded
window.addEventListener('load', function () {
  document.getElementById('submitButton').addEventListener('click', submit)
})

//  Set saved credentials
function setCredential() {
  if (!connector.secrets) return
  const { siteUrl, patName, patValue, query } = connector.secrets
  document.getElementById('siteUrl').value = siteUrl
  document.getElementById('patName').value = patName
  document.getElementById('patValue').value = patValue
  document.getElementById('query').value = query
}

//  On submit button clicked
async function submit() {

  /*  Step 1: Get the input values needed to make API calls    */
  const siteUrl = document.getElementById('siteUrl').value.trim();
  const patName = document.getElementById('patName').value.trim();
  const patValue = document.getElementById('patValue').value.trim();
  const query = document.getElementById('query').value.trim();
  //  Extract the baseUrl and siteName, from the siteUrl
  const { baseUrl, siteName } = parseUrl(siteUrl);
  if (!baseUrl){
    console.log(`Error parsing url ${siteUrl}`);
    return;
  }  

  /*  Step 2: Save the secrets  */
  connector.secrets = {
    baseUrl: baseUrl,
    siteName: siteName,
    patName: patName,
    patValue: patValue,
    query: { "query": query, "variables": null }
  }

  /*  Step 3: Define the custom handlers (from ../handlers/*) as well as the URL path for our Metadata API queries */
  connector.handlerInputs = [
    {
      fetcher: 'CustomAuthFetcher',
      parser: 'CustomAuthParser',
      data: {
        url: `${baseUrl}/api/metadata/graphql`,
      },
    },
  ]

  /*  Step 4: Submit!  */
  connector.submit()
}

//  Helper function to parse a Tableau URL, and return the baseUrl & siteName
function parseUrl(urlString) {

  //  Strip off any query strings
  const host = urlString.split('?')[0];

  //  Define the regex to use
  const regex = /(.+)\/#\/site\/(.+)\//i;

  //  Test the regex first
  if (regex.test(host)){

    //  Execute teh regex command
    let m = regex.exec(host);

    //  Parse out the baseUrl and siteId
    const baseUrl = m[1],
          siteId = m[2];

    //  Return the base url for all API calls ie. https://10ay.online.tableau.com/api/3.19
    return {baseUrl, siteId} 
  } else {
    //  Couldn't parse the URL string, return null
    return null;
  }
}