# Tableau Cloud Metadata API Connector
![Viz Screenshot](/screenshots/Viz.png)
This project contains the source code for using the [Web Data Connector (3.0)](https://help.tableau.com/current/api/webdataconnector/en-us/index.html) framework to query Tableau's [Metadata API](https://help.tableau.com/current/api/metadata_api/en-us/index.html).  The Metadata API allows users to write GraphQL queries for assets that live on a Tableau Cloud site.  Using this connector, you can now use these queries as a data source for creating visualizations in Tableau Desktop.

##  Setup

### Dependencies
In order to build this web data connector, you will need to install the dependencies required by Tableau.  

* Metadata API - There are some Tableau specific settings, which can be found [here](https://help.tableau.com/current/api/metadata_api/en-us/docs/meta_api_start.html#prerequisites).  Basically, you need to ensure the Metadata API is enabled AND that your Tableau user has permissions to query it.  

* Taco Toolkit - You will also need to install the Taco Toolkit, following the instructions [here](https://help.tableau.com/current/api/webdataconnector/en-us/index.html).  This provides the tooling to build & package your connector.  You can verify this is working by typing ```taco --version``` into your command window.  It should print the current version of the Taco Toolkit.

### Build & Package the WDC
Clone this repository and open a command window at the root of the project.  Enter the following commands, one at a time
```
# This will clean out your workspace (just in case there was some extra stuff in there)
taco clean

# Build the connector (installs dependencies, compiles code)
taco build

# Packages the connector in a format Tableau will recognize
taco pack

# Test the connector using Tableau Desktop
taco run Desktop
```
The last command should open up Tableau Desktop, with the connector installed.  Now it's time to test it out.

## Using the connector
Open Tableau Desktop and select the **TableauCloud_MetadataAPI** connector from the list of possible data sources.  You will be prompted for some information about your Tableau Cloud environment.  
![User Input Screen](/screenshots/InteractivePhase.png)

You will need 4 things in order to query for data:
* **Tableau Cloud Site URL** - This is the URL to your Tableau Cloud site.  It should have a format like this: ```https://us-east-1.online.tableau.com/#/site/devplatembed/home```.  We use this to derive the pod ```us-east-1``` as well as the site name ```devplatembed```.
* **PAT Name** - The name of your [personal access token](https://help.tableau.com/current/online/en-us/security_personal_access_tokens.htm)
* **PAT Value** - The value of your personal access token
* **Query** - the query to send to Tableau's Metadata API.  There is an [API reference](https://help.tableau.com/current/api/metadata_api/en-us/reference/index.html), which lists the possible things to query for (as well as what can be derived at various levels).  If you've never worked with the Metadata API before, [this](https://help.tableau.com/current/api/metadata_api/en-us/docs/meta_api_start.html) is a good starting point.  Test your query using the GraphiQL query tool to verify the data it returns, then copy/paste into this connector.

Once you've input your credentials, click the **Get Data** button to execute the query.  You should get taken to the Data Sources page, which will show a table for the object your queried for.

## How it works
Tableau's Metadata API returns query results in a JSON object with the following structure, where <object-name> is what you queried for:
```
{
  "data": {
    "<object-name>": [ 
      ...
    ]
  }
}
```

So if you had the following query, to get the list of databases on a site: 
```
{
  databases {
    id 
    name 
    connectionType 
    isEmbedded
  }
}
```
The resultset would look like this: 
```
{
    "data": {
        "databases": [
            {
                "id": "<some-id>",
                "name": "<database-or-file-name>",
                "connectionType": "",
                "isEmbedded": true/false
            },
            ...
        ]
    }
}
```
This is pretty simple, as we have a single row per database/file.  But what about when we ask for related (nested) things?
```
{
  databases {
    id 
    name 
    connectionType 
    isEmbedded 
    isCertified 
    downstreamDashboards { 
      id 
      name 
      updatedAt 
      workbook { 
        name 
      } 
    }
  }
}
```
The above query asks for all databases, and for each one list the dashboards that reference it.  This can produce a resultset like this:
```
{
    "data": {
        "databases": [
            {
                "id": "1",
                "name": "somefile.csv",
                "connectionType": "textscan",
                "isEmbedded": true,
                "isCertified": false,
                "downstreamDashboards": []
            },
            {
                "id": "2",
                "name": "someExtract.hyper",
                "connectionType": "hyper",
                "isEmbedded": true,
                "isCertified": false,
                "downstreamDashboards": [
                    {
                        "id": "dashboard-guid",
                        "name": "some dashboard name",
                        "updatedAt": "2023-02-27T16:24:27Z",
                        "workbook": {
                            "name": "some workbook name"
                        }
                    },
                    {
                        "id": "another-dashboard-guid",
                        "name": "another dashboard name",
                        "updatedAt": "2023-02-17T12:04:11Z",
                        "workbook": {
                            "name": "some workbook name"
                        }
                    }
                ]
            },
            ...
        ]
    }
}
```
So in the above example, there are 2 databases.  The first database has no downstream dashboards and the 2nd has 2 dashboards, making the JSON structure different.  

This connector will flatten the JSON into a dataframe, and expand it based on the objects in nested arrays.  So for the above example, we should get a table that looks like this:

| id  | name | connectionType | isEmbedded | isCertified | downstreamDashboards.id | downstreamDashboards.name | downstreamDashboards.updatedAt | downstreamDashboards.workbook.name |
| ---  | --- | --- | --- | --- | --- | --- | --- | --- |
| 1  | somefile.csv | textscan | true | false |  |  |  |  |
| 2  | someExtract.hyper | hyper | true | false | dashboard-guid | some dashboard name | 2023-02-27T16:24:27Z | myworkbook |
| 2  | someExtract.hyper | hyper | true | false | another-dashboard-guid | another dashboard name | 2023-02-17T12:04:11Z | some workbook name |


## Notes
 * This connector was built to work with Tableau Cloud, not Tableau Server.  The reason, is that the WDC framework requires the developer to allowList the URL endpoints it will hit.  Since your Tableau Server could have any hostname (tableau.company.com, analytics.company.com, etc) there is not secure way to allowList all possibilies.  If you'd like to use this connector against Tableau Server, open up **connector.json** and look for the ```permissions.api``` object.  Change out *https://*.online.tableau.com* with the hostname of your Tableau Server environment.  You will have to run ```taco build``` and ```taco pack``` after making this (or any) code change.
 * "Error: Extract Not Created" - This error occurs on the earliest release of Tableau version 2023.1.  Upgrading to a newer version will resolve the issue.

