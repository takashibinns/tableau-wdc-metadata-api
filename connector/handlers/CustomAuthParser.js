import { DataType, Parser, log } from '@tableau/taco-toolkit/handlers'

const allowDatetime = true;

/***********************************/
/*  Helper Functions               */
/***********************************/

// Helper function that flattens the JSON input into an array
const generateNestedKeyNameAndValue = (input, nestedKeyName, keyValueArr) => {
  // Check the input type
  if (typeof input === "object") {
     // Must be an array or object - iterate over them
     const quoteString = Array.isArray(input) ? "" : "'";
     Object.entries(input).forEach(([key, value]) => {
        // Recursively call this function, and extend the key name 
        generateNestedKeyNameAndValue(value, `${nestedKeyName}[${quoteString}${key}${quoteString}]`,keyValueArr);
     });
  } else {
     // string or number (end value)
     keyValueArr.push([nestedKeyName, input]);
  }
};

// Helper function to remove square brackets and single quotes from fieldnames
const fieldNameCleaner = (name) => {
  return name.replaceAll("[","").replaceAll("]","").replaceAll("'","");
}

// Recursive function to split each row into multiple rows, if there are nested arrays
const rowSplitter = (row) => {

  // Create a placeholder row object
  let newRow = {};
  let nestedArrayRows = [];

  // Loop through each field in the row
  for (const [fieldname, value] of Object.entries(row)) {
     // Is this field a regular property, or part of a nested array?
     let fieldnameParts = fieldname.split(/\[[0-9]+\](.*)/s);
     if (fieldnameParts.length > 1){
        // This field contains at least 1 nested array (multiple rows)
        nestedArrayRows.push({
           "fieldname": fieldname,
           "fieldnameParts": fieldnameParts,
           "rowNum": parseInt(fieldNameCleaner(fieldname.match(/\[[0-9]+\]/s)[0])),
           "value": value
        });
     } else {
        // This field is just a single property (1 row)
        // But is it a datetime? those need to be formatted a certain way
        let newFieldname = fieldNameCleaner(fieldname);
        newRow[newFieldname] = isDatetimeField(newFieldname) ? convertDatetimeString(value) : value;
     }
  }

  // Was this a simple object with no nested arrays?
  if (nestedArrayRows.length === 0) {
     // Yes, return an array w/ length 1 containing the new row
     return [newRow];
  } else {
     // No, there are nested arrays.  Need to send back an array with X rows (based off newRow)
     let newRows = [];
     
     // Group these nestedArray fields based on the rowNum
     let newRowDict = {}
     nestedArrayRows.forEach( arrayRow => {
        // Make sure the obj for this row # exists
        if (!newRowDict[arrayRow.rowNum]) {
           newRowDict[arrayRow.rowNum] = {};
        }
        // Remove the index from the fieldname
        let newFieldname = `${arrayRow.fieldnameParts[0]}.${arrayRow.fieldnameParts[1]}`
        // Save the fieldname/value
        newRowDict[arrayRow.rowNum][newFieldname] = arrayRow.value;
     })

     // Loop through each additional row that needs to be generated
     for (const [fieldname, value] of Object.entries(newRowDict)){
        // Merge the simple properties & nested properties, pass to this function again (recursively)
        const newNestedRow = rowSplitter({...newRow, ...value});
        newRows.push(newNestedRow);
     }

     // Return multiple rows, expanded for all nested arrays
     return newRows.flat();
  }
}

//  Helper function to determine if the field is a Datetime, based on it's name
const isDatetimeField = (fieldname) =>{
  // The list of all datetime fields in the Tableau metadata api
  const dateFields = [ 'createdAt', 'updatedAt', 'extractLastRefreshTime', 'extractLastIncrementalUpdateTime', 'extractLastUpdateTime', 'extractLastRefreshedAt','extractLastRefreshedAtWithin' ];
  // Loop through this list, and check the fieldname
  let isMatch = dateFields.filter( name => {
    return fieldname.includes(name);
  }).length>0;
  //  Return true/false
  return isMatch;
}

//  Helper function to convert datetime strings from the Metadata API to a datestring that Tableau will recognize
const convertDatetimeString = (dt) => {
  //return dt ? new Date(dt) : new Date(1970,1,1);
  return dt ? new Date(dt) : null;
}

// Helper function to determine the Tableu datatype based on a value
const getTableauDatatype = (fieldname, value) => {

  /* First check if the field is a DateTime */
  if (isDatetimeField(fieldname)) {
     return {
        id: fieldname, 
        dataType: allowDatetime ? DataType.Datetime : DataType.String
     }
  }

  /* Next, check if the field is a boolean */
  if (typeof value == "boolean"){
     return {
        id: fieldname, 
        dataType: DataType.Bool 
     }
  }

  /* Next, check for numeric fields */
  if (typeof value == "number" || typeof value == "bigint"){
     // Is it an integer or float?
     return {
        id: fieldname,
        dataType: value.toString().includes(".") ? DataType.Float : DataType.Int
     }
  }

  /* Next, check for strings */
  if (typeof value == "string"){
     return {
        id: fieldname,
        dataType: DataType.String
     }
  }

  /* Couldn't determine a datatype */
  return {
     id: fieldname,
     dataType: null
  }
}

/***********************************/
/*  CustomAuthParser               */
/*  Parse JSON response            */
/***********************************/
export default class CustomAuthParser extends Parser {
  parse(fetcherResult, { dataContainer }) {

    //  Create a containerBuilder
    const containerBuilder = Parser.createContainerBuilder(dataContainer);

    //  Flatten the JSON query results
    let tables = Object.keys(fetcherResult.data);

    /******************************************************/
    /* Step 1: Loop through each result set               */
    /*  There is usually only one result set per query,   */
    /*  but just in case the query returns multipler      */
    /******************************************************/

    //  Loop through each "key" in the data results
    tables.forEach((tableName) => {

      //  Fetch an array of data for the key
      let originalData = fetcherResult.data[tableName];
      log(`Parsing data for table: ${tableName}`);

      /******************************************************/
      /* Step 2: Flatten the JSON object                    */
      /*  Since JSON is unstructured, we need to conver it  */
      /*  to a flat array of data (rows)                    */
      /******************************************************/

      //  Flatten the data into key-value pairs
      let flattenedData = Object.fromEntries(
          Object.entries(originalData).map(([key, value]) => {
              const generatedKeyValuePairs = [];
              generateNestedKeyNameAndValue(value, "", generatedKeyValuePairs);
              return [key, Object.fromEntries(generatedKeyValuePairs)];
          })
      );

      /******************************************************/
      /* Step 3: Handle nested arrays                       */
      /*  Each "row" may have properties with nested arrays */
      /*  Need to check for this an expand the dataset      */
      /******************************************************/

      // Loop through each "row" of data and expand any rows with nested arrays
      let tableDataArrays = []
      for (let rowNumber in Object.keys(flattenedData)){
          tableDataArrays.push(rowSplitter(flattenedData[rowNumber]));
      }

      // That left us with an array of arrays (some w/ 1 row, others with N rows).  Need to flatten once more
      let tableData = tableDataArrays.flat();

      //  Get a reference to this table
      let { isNew, tableBuilder } = containerBuilder.getTable(tableName);

      /******************************************************/
      /* Step 4: Derive the table's metadata                */
      /*  Loop through each row, & check each field's value */
      /*  Determine which Tableau DataType is applicable    */
      /******************************************************/

      // Loop over each row in tableData
      log(`Parsing metadata for table: ${tableName}`);
      let columnsDictionary = {};
      tableData.forEach( row => {
          // Loop over every field in each row (not every row will have the same fields)
          Object.entries(row).map(([fieldname, value]) => {
            // Have we already determined this fields datatype? and does it have a defined dataType? if the datatype is numeric, what if later values are string?
            if (!columnsDictionary[fieldname] || !columnsDictionary[fieldname].dataType || columnsDictionary[fieldname].dataType === DataType.Int || columnsDictionary[fieldname].dataType === DataType.Float){
                // This is a new field, record it's data type
                columnsDictionary[fieldname] = getTableauDatatype(fieldname, value);
            }
          })
      })

      // Loop through all the columns
      let columns = [];
      Object.entries(columnsDictionary).map(([columnname, column]) => {
          // Since it's possible that some fields we all null, we need to double check and assign them a default value (string)
          column.dataType = column.dataType ? column.dataType : DataType.String; 
          // Push to the columns array
          columns.push(column);
      })

      //  If this is a new table, add the columns to the tableBuilder
      if (isNew) {
        tableBuilder.addColumnHeaders(columns);
      }

      /************************************************************/
      /* Step 5: Make sure each row has a reference to each field */
      /*  Each row should have the same list of properties        */
      /*  If they don't exist, they should just be null           */
      /************************************************************/
      tableData.map( row => {
        //  Figure out what keys are already existing in the row
        let rowFields = Object.keys(row);
        //  Are any columns missing?
        if (rowFields.length !== columns.length){
          columns.map( column => {
            if (!(column.id in row)){
               if (column.dataType === DataType.Datetime){
                  log('missing datetime value')
                  //row[column.id] = convertDatetimeString(null);
               } else {
                  row[column.id] = null;
               }
            }
          })
        }
      })

      //  Append each "row" of data to the tableBuilder
      tableBuilder.addRows(tableData);

      log(`Parsing complete for table: ${tableName}`);
    })

    //  Return all tables, using containerBuilder
    log(`Parsing complete for all tables (${tables.length})`);
    return containerBuilder.getDataContainer()
  }
}
