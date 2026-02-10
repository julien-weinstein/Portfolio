/**
 * Six featured cities with precise lat/lon for API lookups
 * and approximate SVG coordinates for the map (960×600 Albers-style viewBox).
 */
const CITIES = [
    {
        id: "lax",
        name: "Los Angeles",
        label: "LAX Airport",
        state: "CA",
        lat: 33.9425,
        lon: -118.408,
        mapX: 108,
        mapY: 400
    },
    {
        id: "den",
        name: "Denver",
        label: "Denver",
        state: "CO",
        lat: 39.7392,
        lon: -104.9903,
        mapX: 305,
        mapY: 310
    },
    {
        id: "dfw",
        name: "Dallas",
        label: "Dallas",
        state: "TX",
        lat: 32.7767,
        lon: -96.7970,
        mapX: 470,
        mapY: 448
    },
    {
        id: "aus",
        name: "Austin",
        label: "Austin",
        state: "TX",
        lat: 30.2672,
        lon: -97.7431,
        mapX: 448,
        mapY: 478
    },
    {
        id: "mia",
        name: "Miami",
        label: "MIA Airport",
        state: "FL",
        lat: 25.7959,
        lon: -80.2870,
        mapX: 715,
        mapY: 545
    },
    {
        id: "nyc",
        name: "New York City",
        label: "Central Park",
        state: "NY",
        lat: 40.7829,
        lon: -73.9654,
        mapX: 835,
        mapY: 230
    }
];
