import { Fetcher, FetchUtils, getAuthHeader } from '@tableau/taco-toolkit/handlers'

//  Specify the Tableau API version
const apiVersion = "3.19"
//  Define the default options object for urlFetch
const fetchOptions = {
  'headers': {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
  }
}

//  Tableau REST API: Sign In to Tableau, using personal access token (returns an API token + siteId)
const getToken = async (baseUrl, patName, patValue, siteName) => {
  
  //  REST API Endpoint
  const url = `${baseUrl}/api/${apiVersion}/auth/signin`;
    
  //  Login payload
  const payload = {
    "credentials": {
      "personalAccessTokenName": patName,
      "personalAccessTokenSecret" :patValue,
      "site": {
        "contentUrl": siteName
      }
    }
  }

  //  Execute API call
  const data = await FetchUtils.fetchJson(url, {
    method: 'POST',
    headers: fetchOptions.headers,
    body: JSON.stringify(payload)
  })

  //  Get the return values
  const token = data.credentials.token,
        siteId = data.credentials.site.id;

  return { token, siteId }
}

/***********************************/
/*  CustomAuthFetcher              */
/*  Get an API token from Tableau  */
/***********************************/
export default class CustomAuthFetcher extends Fetcher {
  async *fetch({ handlerInput, secrets }) {

    //  Get the saved secrets (user input)
    const { baseUrl, siteName, patName, patValue, query } = secrets;

    //  Get a Tableau REST API token
    const { token, siteId } = await getToken(baseUrl, patName, patValue, siteName);

    //  Define a set of headers to use for all future API calls
    //let headers = structuredClone(fetchOptions);
    let headers = Object.assign({}, fetchOptions.headers);
    headers['X-Tableau-Auth'] = token;

    const config = {
      "method": "POST",
      "headers": headers,
      "body": query
    }

    //  Fetch data from the API
    //yield await FetchUtils.fetchJson(handlerInput.data.url, { headers })
    yield await FetchUtils.fetchJson(handlerInput.data.url, config)
  }
}
