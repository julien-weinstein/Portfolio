/**
 * Cities database for the continental United States.
 * Each state has representative cities with lat/lon for API lookups.
 * The first city in each array is the state capital or major city used for the state overview.
 */
const CITIES_DATA = {
    AL: { name: "Alabama", cities: [
        { name: "Birmingham", lat: 33.52, lon: -86.81 },
        { name: "Montgomery", lat: 32.37, lon: -86.30 },
        { name: "Huntsville", lat: 34.73, lon: -86.59 },
        { name: "Mobile", lat: 30.69, lon: -88.04 }
    ]},
    AZ: { name: "Arizona", cities: [
        { name: "Phoenix", lat: 33.45, lon: -112.07 },
        { name: "Tucson", lat: 32.22, lon: -110.97 },
        { name: "Flagstaff", lat: 35.20, lon: -111.65 },
        { name: "Mesa", lat: 33.42, lon: -111.83 }
    ]},
    AR: { name: "Arkansas", cities: [
        { name: "Little Rock", lat: 34.75, lon: -92.29 },
        { name: "Fayetteville", lat: 36.06, lon: -94.16 },
        { name: "Fort Smith", lat: 35.39, lon: -94.40 }
    ]},
    CA: { name: "California", cities: [
        { name: "Los Angeles", lat: 34.05, lon: -118.24 },
        { name: "San Francisco", lat: 37.77, lon: -122.42 },
        { name: "San Diego", lat: 32.72, lon: -117.16 },
        { name: "Sacramento", lat: 38.58, lon: -121.49 },
        { name: "Fresno", lat: 36.74, lon: -119.77 }
    ]},
    CO: { name: "Colorado", cities: [
        { name: "Denver", lat: 39.74, lon: -104.99 },
        { name: "Colorado Springs", lat: 38.83, lon: -104.82 },
        { name: "Boulder", lat: 40.01, lon: -105.27 },
        { name: "Fort Collins", lat: 40.59, lon: -105.08 }
    ]},
    CT: { name: "Connecticut", cities: [
        { name: "Hartford", lat: 41.76, lon: -72.68 },
        { name: "New Haven", lat: 41.31, lon: -72.92 },
        { name: "Stamford", lat: 41.05, lon: -73.54 }
    ]},
    DE: { name: "Delaware", cities: [
        { name: "Wilmington", lat: 39.74, lon: -75.55 },
        { name: "Dover", lat: 39.16, lon: -75.52 }
    ]},
    FL: { name: "Florida", cities: [
        { name: "Miami", lat: 25.76, lon: -80.19 },
        { name: "Orlando", lat: 28.54, lon: -81.38 },
        { name: "Tampa", lat: 27.95, lon: -82.46 },
        { name: "Jacksonville", lat: 30.33, lon: -81.66 },
        { name: "Tallahassee", lat: 30.44, lon: -84.28 }
    ]},
    GA: { name: "Georgia", cities: [
        { name: "Atlanta", lat: 33.75, lon: -84.39 },
        { name: "Savannah", lat: 32.08, lon: -81.09 },
        { name: "Augusta", lat: 33.47, lon: -81.97 }
    ]},
    ID: { name: "Idaho", cities: [
        { name: "Boise", lat: 43.62, lon: -116.21 },
        { name: "Idaho Falls", lat: 43.49, lon: -112.04 },
        { name: "Coeur d'Alene", lat: 47.68, lon: -116.78 }
    ]},
    IL: { name: "Illinois", cities: [
        { name: "Chicago", lat: 41.88, lon: -87.63 },
        { name: "Springfield", lat: 39.78, lon: -89.65 },
        { name: "Rockford", lat: 42.27, lon: -89.09 },
        { name: "Peoria", lat: 40.69, lon: -89.59 }
    ]},
    IN: { name: "Indiana", cities: [
        { name: "Indianapolis", lat: 39.77, lon: -86.16 },
        { name: "Fort Wayne", lat: 41.08, lon: -85.14 },
        { name: "Evansville", lat: 37.97, lon: -87.56 }
    ]},
    IA: { name: "Iowa", cities: [
        { name: "Des Moines", lat: 41.59, lon: -93.62 },
        { name: "Cedar Rapids", lat: 41.98, lon: -91.67 },
        { name: "Davenport", lat: 41.52, lon: -90.58 }
    ]},
    KS: { name: "Kansas", cities: [
        { name: "Wichita", lat: 37.69, lon: -97.34 },
        { name: "Topeka", lat: 39.05, lon: -95.68 },
        { name: "Kansas City", lat: 39.11, lon: -94.63 }
    ]},
    KY: { name: "Kentucky", cities: [
        { name: "Louisville", lat: 38.25, lon: -85.76 },
        { name: "Lexington", lat: 38.04, lon: -84.50 },
        { name: "Frankfort", lat: 38.20, lon: -84.87 }
    ]},
    LA: { name: "Louisiana", cities: [
        { name: "New Orleans", lat: 29.95, lon: -90.07 },
        { name: "Baton Rouge", lat: 30.45, lon: -91.19 },
        { name: "Shreveport", lat: 32.53, lon: -93.75 }
    ]},
    ME: { name: "Maine", cities: [
        { name: "Portland", lat: 43.66, lon: -70.26 },
        { name: "Augusta", lat: 44.31, lon: -69.78 },
        { name: "Bangor", lat: 44.80, lon: -68.77 }
    ]},
    MD: { name: "Maryland", cities: [
        { name: "Baltimore", lat: 39.29, lon: -76.61 },
        { name: "Annapolis", lat: 38.97, lon: -76.49 },
        { name: "Frederick", lat: 39.41, lon: -77.41 }
    ]},
    MA: { name: "Massachusetts", cities: [
        { name: "Boston", lat: 42.36, lon: -71.06 },
        { name: "Worcester", lat: 42.26, lon: -71.80 },
        { name: "Springfield", lat: 42.10, lon: -72.59 }
    ]},
    MI: { name: "Michigan", cities: [
        { name: "Detroit", lat: 42.33, lon: -83.05 },
        { name: "Grand Rapids", lat: 42.96, lon: -85.66 },
        { name: "Lansing", lat: 42.73, lon: -84.56 },
        { name: "Traverse City", lat: 44.76, lon: -85.62 }
    ]},
    MN: { name: "Minnesota", cities: [
        { name: "Minneapolis", lat: 44.98, lon: -93.27 },
        { name: "St. Paul", lat: 44.95, lon: -93.09 },
        { name: "Duluth", lat: 46.79, lon: -92.10 },
        { name: "Rochester", lat: 44.02, lon: -92.47 }
    ]},
    MS: { name: "Mississippi", cities: [
        { name: "Jackson", lat: 32.30, lon: -90.18 },
        { name: "Gulfport", lat: 30.37, lon: -89.09 },
        { name: "Hattiesburg", lat: 31.33, lon: -89.29 }
    ]},
    MO: { name: "Missouri", cities: [
        { name: "Kansas City", lat: 39.10, lon: -94.58 },
        { name: "St. Louis", lat: 38.63, lon: -90.20 },
        { name: "Springfield", lat: 37.22, lon: -93.29 },
        { name: "Jefferson City", lat: 38.58, lon: -92.17 }
    ]},
    MT: { name: "Montana", cities: [
        { name: "Billings", lat: 45.78, lon: -108.50 },
        { name: "Missoula", lat: 46.87, lon: -114.00 },
        { name: "Helena", lat: 46.60, lon: -112.04 }
    ]},
    NE: { name: "Nebraska", cities: [
        { name: "Omaha", lat: 41.26, lon: -95.94 },
        { name: "Lincoln", lat: 40.81, lon: -96.70 },
        { name: "Grand Island", lat: 40.92, lon: -98.34 }
    ]},
    NV: { name: "Nevada", cities: [
        { name: "Las Vegas", lat: 36.17, lon: -115.14 },
        { name: "Reno", lat: 39.53, lon: -119.81 },
        { name: "Carson City", lat: 39.16, lon: -119.77 }
    ]},
    NH: { name: "New Hampshire", cities: [
        { name: "Manchester", lat: 42.99, lon: -71.46 },
        { name: "Concord", lat: 43.21, lon: -71.54 },
        { name: "Nashua", lat: 42.77, lon: -71.47 }
    ]},
    NJ: { name: "New Jersey", cities: [
        { name: "Newark", lat: 40.74, lon: -74.17 },
        { name: "Trenton", lat: 40.22, lon: -74.76 },
        { name: "Atlantic City", lat: 39.36, lon: -74.42 }
    ]},
    NM: { name: "New Mexico", cities: [
        { name: "Albuquerque", lat: 35.08, lon: -106.65 },
        { name: "Santa Fe", lat: 35.69, lon: -105.94 },
        { name: "Las Cruces", lat: 32.35, lon: -106.76 }
    ]},
    NY: { name: "New York", cities: [
        { name: "New York City", lat: 40.71, lon: -74.01 },
        { name: "Buffalo", lat: 42.89, lon: -78.88 },
        { name: "Albany", lat: 42.65, lon: -73.76 },
        { name: "Syracuse", lat: 43.05, lon: -76.15 }
    ]},
    NC: { name: "North Carolina", cities: [
        { name: "Charlotte", lat: 35.23, lon: -80.84 },
        { name: "Raleigh", lat: 35.78, lon: -78.64 },
        { name: "Asheville", lat: 35.60, lon: -82.55 },
        { name: "Wilmington", lat: 34.23, lon: -77.94 }
    ]},
    ND: { name: "North Dakota", cities: [
        { name: "Fargo", lat: 46.88, lon: -96.79 },
        { name: "Bismarck", lat: 46.81, lon: -100.78 },
        { name: "Grand Forks", lat: 47.93, lon: -97.03 }
    ]},
    OH: { name: "Ohio", cities: [
        { name: "Columbus", lat: 39.96, lon: -83.00 },
        { name: "Cleveland", lat: 41.50, lon: -81.69 },
        { name: "Cincinnati", lat: 39.10, lon: -84.51 },
        { name: "Toledo", lat: 41.65, lon: -83.54 }
    ]},
    OK: { name: "Oklahoma", cities: [
        { name: "Oklahoma City", lat: 35.47, lon: -97.52 },
        { name: "Tulsa", lat: 36.15, lon: -95.99 },
        { name: "Norman", lat: 35.22, lon: -97.44 }
    ]},
    OR: { name: "Oregon", cities: [
        { name: "Portland", lat: 45.52, lon: -122.68 },
        { name: "Salem", lat: 44.94, lon: -123.04 },
        { name: "Eugene", lat: 44.05, lon: -123.09 },
        { name: "Bend", lat: 44.06, lon: -121.31 }
    ]},
    PA: { name: "Pennsylvania", cities: [
        { name: "Philadelphia", lat: 39.95, lon: -75.17 },
        { name: "Pittsburgh", lat: 40.44, lon: -80.00 },
        { name: "Harrisburg", lat: 40.26, lon: -76.88 },
        { name: "Erie", lat: 42.13, lon: -80.09 }
    ]},
    RI: { name: "Rhode Island", cities: [
        { name: "Providence", lat: 41.82, lon: -71.41 },
        { name: "Newport", lat: 41.49, lon: -71.31 }
    ]},
    SC: { name: "South Carolina", cities: [
        { name: "Charleston", lat: 32.78, lon: -79.93 },
        { name: "Columbia", lat: 34.00, lon: -81.03 },
        { name: "Greenville", lat: 34.85, lon: -82.40 }
    ]},
    SD: { name: "South Dakota", cities: [
        { name: "Sioux Falls", lat: 43.54, lon: -96.73 },
        { name: "Rapid City", lat: 44.08, lon: -103.23 },
        { name: "Pierre", lat: 44.37, lon: -100.35 }
    ]},
    TN: { name: "Tennessee", cities: [
        { name: "Nashville", lat: 36.16, lon: -86.78 },
        { name: "Memphis", lat: 35.15, lon: -90.05 },
        { name: "Knoxville", lat: 35.96, lon: -83.92 },
        { name: "Chattanooga", lat: 35.05, lon: -85.31 }
    ]},
    TX: { name: "Texas", cities: [
        { name: "Houston", lat: 29.76, lon: -95.37 },
        { name: "Dallas", lat: 32.78, lon: -96.80 },
        { name: "Austin", lat: 30.27, lon: -97.74 },
        { name: "San Antonio", lat: 29.42, lon: -98.49 },
        { name: "El Paso", lat: 31.76, lon: -106.49 }
    ]},
    UT: { name: "Utah", cities: [
        { name: "Salt Lake City", lat: 40.76, lon: -111.89 },
        { name: "Provo", lat: 40.23, lon: -111.66 },
        { name: "St. George", lat: 37.10, lon: -113.58 }
    ]},
    VT: { name: "Vermont", cities: [
        { name: "Burlington", lat: 44.48, lon: -73.21 },
        { name: "Montpelier", lat: 44.26, lon: -72.58 }
    ]},
    VA: { name: "Virginia", cities: [
        { name: "Virginia Beach", lat: 36.85, lon: -75.98 },
        { name: "Richmond", lat: 37.54, lon: -77.44 },
        { name: "Norfolk", lat: 36.85, lon: -76.29 },
        { name: "Roanoke", lat: 37.27, lon: -79.94 }
    ]},
    WA: { name: "Washington", cities: [
        { name: "Seattle", lat: 47.61, lon: -122.33 },
        { name: "Spokane", lat: 47.66, lon: -117.43 },
        { name: "Tacoma", lat: 47.25, lon: -122.44 },
        { name: "Olympia", lat: 47.04, lon: -122.90 }
    ]},
    WV: { name: "West Virginia", cities: [
        { name: "Charleston", lat: 38.35, lon: -81.63 },
        { name: "Huntington", lat: 38.42, lon: -82.45 },
        { name: "Morgantown", lat: 39.63, lon: -79.96 }
    ]},
    WI: { name: "Wisconsin", cities: [
        { name: "Milwaukee", lat: 43.04, lon: -87.91 },
        { name: "Madison", lat: 43.07, lon: -89.40 },
        { name: "Green Bay", lat: 44.51, lon: -88.02 }
    ]},
    WY: { name: "Wyoming", cities: [
        { name: "Cheyenne", lat: 41.14, lon: -104.82 },
        { name: "Casper", lat: 42.87, lon: -106.31 },
        { name: "Jackson", lat: 43.48, lon: -110.76 }
    ]},
    DC: { name: "Washington D.C.", cities: [
        { name: "Washington", lat: 38.91, lon: -77.04 }
    ]}
};
