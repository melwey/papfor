// PAPfor forest cover at start of the project
// for all forest KLCD in West Africa included in the project.
// based on JRC TMF disturbances: map tropical moist forest at the end of 2019 and calculate surfaces in KLCDs
// based on Hansen: map tree cover 2019 (or 2020?) - TO DO: calculate area inside and outside PAs

// Alerts? RADD forest disturbance alerts or GLAD alerts

// KLCD - uploaded as asset
var klc = ee.FeatureCollection("users/mweynants/BIOPAMA/klc_2020");
// select landscapes relevant to PAPfor: CAF_01 Cross river; WAF_10 Tai-Sapo; WAF_11: Gola-Ziama;
// WAF_12: Outamba-Kilimi; WAF_21: Mount Nimba
var papfor = klc.filter(ee.Filter.inList('KLC_ID', ["CAF_01", "WAF_10", "WAF_11", "WAF_12", "WAF_21"]));
// Create an empty image into which to paint the features, cast to byte.
var empty = ee.Image().byte();
// Paint the edges with different colors, display.
var outlines = empty.paint({
  featureCollection: papfor,
  color: 'fid',
  width: 4
});
var palette = ['FF0000', '00FF00', '0000FF'];
//Map.addLayer(outlines, {palette: palette, max: 80}, 'KLC');

// wdpa
var wdpa = ee.FeatureCollection("WCMC/WDPA/current/polygons");

// TMF
// see https://forobs.jrc.ec.europa.eu/TMF/gee_tutorial/
// Visualizing one specific year within the Annual Change collection
// First, it is necessary to select the year of interest with the following code:
var AnnualChanges = ee.ImageCollection('projects/JRC/TMF/v1_2019/AnnualChanges').mosaic();
var year = ee.Number(2019);
var AnnualChangesYear = AnnualChanges.select(ee.String('Dec').cat(year.format()));

// To display a specific color for each class of the annual change dataset we add a palette with color codes and label for each discrete value:
function rgb(r,g,b){var bin = r << 16 | g << 8 | b; return (function(h){  return new Array(7-h.length).join("0")+h;
          })(bin.toString(16).toUpperCase());}

var PALETTEAnnualChanges = [
    rgb(0,90,0), // val 1. Undisturbed Tropical moist forest (TMF)
    rgb(100,155,35), // val 2. Degraded TMF
    rgb(255,135,15), // val 3. Deforested land
    rgb(210,250,60), // val 4. Forest regrowth
    rgb(0,140,190), // val 5. Permanent or seasonal Water
    rgb(255,255,255), // val 6. Other land cover
];

// And we display the year selected with the palette:

// loop over KLC to get the cover stats. Total + inside PAs

// write a function to be mapped on the feature collection .
// within that function, loop on the values of TMf's AnnualChanges
var keys = ee.List(['UndisturbedTMF', 'DegradedTMF', 'Deforested', 'RegrownForest', 'Water', 'Other']);
var keysPa = ee.List(['UndisturbedTMF_PA', 'DegradedTMF_PA', 'Deforested_PA', 'RegrownForest_PA', 'Water_PA', 'Other_PA']);
var iList = ee.List.sequence(0, 5);
var inputD = ee.Dictionary.fromLists(keys,iList);
var inputDpa = ee.Dictionary.fromLists(keysPa,iList);

function stats(feature){
  var output_feature = ee.Feature(null).copyProperties(feature, ['KLC_ID', 'KLC_name', 'Area_km2']);
  // loop on keys
  function getValue(k,i){
  // create dictionary with keys as AnnualChanges classes and values as areas
  i = ee.Number(i);
    // only values that match i+1
    var Mask = AnnualChangesYear.eq(i.add(1));
    var inputImage = AnnualChangesYear
        .mask(Mask)
        .rename('area'); // [k] arg names needs to be a list of strings...
    var value = inputImage
        // need to have only ones: divide by value of class
        .divide(i.add(1))
        // multiply pixels by area in sqkm
        .multiply(ee.Image.pixelArea().divide(1000 * 1000))
        .reduceRegion({
          reducer: ee.Reducer.sum(),
          geometry: feature.geometry(),
          scale: 30,
          maxPixels: 1e13
        });
    return value.get('area');
  }
  // loop on keys
  function getValuePa(k,i){
  // create dictionary with keys as AnnualChanges classes and values as areas
  i = ee.Number(i);
    // only values that match i+1
    var Mask = AnnualChangesYear.eq(i.add(1));
    var inputImage = AnnualChangesYear
        .mask(Mask)
        // clip to wdpa
        .clipToCollection(wdpa)
        .rename('area'); // [k] arg names needs to be a list of strings...
    var value = inputImage
        // need to have only ones: divide by value of class
        .divide(i.add(1))
        // multiply pixels by area in sqkm
        .multiply(ee.Image.pixelArea().divide(1000 * 1000))
        .reduceRegion({
          reducer: ee.Reducer.sum(),
          geometry: feature.geometry(),
          scale: 30,
          maxPixels: 1e13
        });
    return value.get('area');
  }
  output_feature = output_feature.set({Year:  year});
  var D = inputD.map(getValue);
  output_feature = output_feature.set(D);
  var Dpa = inputDpa.map(getValuePa);
  output_feature = output_feature.set(Dpa);
  return output_feature;
}

var TMFstats = papfor.map(stats);
print(TMFstats);

// export
Export.table.toDrive({
    collection: ee.FeatureCollection(TMFstats),
    description: 'TMFstats_KLC',
    fileFormat: 'CSV'
    });

Map.addLayer(AnnualChangesYear.updateMask(AnnualChangesYear).clipToCollection(papfor),{
    'min': 1,
    'max': 6,
    'palette': PALETTEAnnualChanges
}, "JRC - Annual Changes - 2019 – v1 2019", true);

Map.centerObject(papfor);

Map.addLayer(wdpa.draw({color: '006600', strokeWidth: 5}), {}, 'drawn');

// GFC
// adapted from guido's: https://zenodo.org/record/3687096#.YHmK_-8zYk5

// set threshold of tree cover to classify as forest... FAO says 10%, but risk to get lots of savannah

var forest_threshold = 50;

var list_klc = ["CAF_01", "WAF_10", "WAF_11", "WAF_12", "WAF_21"];

// input
var keys = ee.List.sequence(2001, 2020).map(function(x){return ee.Number(x).format("%d")});
var keysPa = ee.List.sequence(2001, 2020).map(function(x){return ee.Number(x).format("%d").cat("_PA")});
var vals = ee.List.sequence(1,20);
var inputD = ee.Dictionary.fromLists(keys, vals);
var inputDpa = ee.Dictionary.fromLists(keysPa, vals);

// function to map on all features
var gfcStats = function(feature) {
  var output_feature = ee.Feature(null).copyProperties(feature, ['KLC_ID', 'KLC_name', 'Area_km2']);
  var aoi = feature.geometry();
  
  // data
  var gfc = ee.Image("UMD/hansen/global_forest_change_2020_v1_8").clip(aoi);
  var treecover = gfc.select(['treecover2000']).clip(aoi);
  //var gain = gfc.select(['gain']).clip(geometry); mask gain?
  
  // Create Mask of canopy coverage greater than the threshold
  var Mask = treecover.gte(forest_threshold);
  
  // Set MMU
  // Minimum Mapping Unit: 5 pixels/ha
  
  //Parameters
  var kernel_clean_size = 100; // Kernel (square) size in meters for the disturbance density related cleaning
  var min_trees = 5; // Minimum number of Trees per cleaning kernel 
  
  //Filter
  var kernelMask = Mask.reduceNeighborhood({
    reducer: ee.Reducer.sum().unweighted(),
    kernel: ee.Kernel.square(kernel_clean_size,'meters', false)
  });
  var MMUMask = Mask
    .where(kernelMask.gte(min_trees),1) // set Mask to 1 if >= MMU
    .and((Mask.where(kernelMask.lt(min_trees),0))) // set Mask to 0 if < MMU
    .unmask(0);
  // var S1_Final_Result_4 = MMUMask.multiply(Mask); ??? why is this necessary ???
  // var Mask = S1_Final_Result_4.unmask(0); ???
  // end MMU
  
  var highTreeCoverage = gfc.mask(MMUMask);
  
  // function to compute area, to map on all years
  function myfun(y, i) {
      var year = ee.Number(i);
      var lossYear = highTreeCoverage.select(['lossyear']);
      // select loss for a single year
      var loss = lossYear.eq(year).rename('area');
      // if PA, clip to wdpa
      loss = ee.Image(ee.Algorithms.If(pa, loss.clipToCollection(wdpa), loss));
      
    // Compute the area of each band.
      var stats = loss
        // multiply pixels by area in sqkm
        .multiply(ee.Image.pixelArea()).divide(1000 * 1000)
        // reduce over feature geometry: sum pixel area
        .reduceRegion({
          reducer: ee.Reducer.sum(),
          geometry: aoi,
          scale: 30,
          maxPixels: 1e13
        });
      return stats.get('area');
    
  }

  // total area
  var pa = false;
  var lossArea = inputD.map(myfun); //dictionary with keys 'year' and 'loss'
  output_feature = output_feature.set(lossArea);
  
  // area within PAs
  pa = true;
  var lossAreaPa = inputDpa.map(myfun);
  output_feature = output_feature.set(lossAreaPa);

  return output_feature;
  
}; // end gfcStats function

// run function on all features
var gfcLossStats = papfor.map(gfcStats);

// export
Export.table.toDrive({
    collection: ee.FeatureCollection(gfcLossStats),
    description: 'GFCstats_KLC_papfor',
    fileFormat: 'CSV'
    });


// // Alerts
// // GLAD alerts (Hansen et al. 2016 https://iopscience.iop.org/article/10.1088/1748-9326/11/3/034008)
//
// var glad = ee.ImageCollection("projects/glad/alert/UpdResult");

// // RADD alerts (Wur 2021 https://doi.org/10.1088/1748-9326/abd0a8)

// //Accessing RADD forest disturbance alert (Reiche et al.,2021)
// //Website: http://radd-alert.wur.nl
// //Citation: Reiche et al. (2021): Forest disturbance alerts for the Congo Basin using Sentinel-1, ERL.
// // https://www.wur.nl/en/Research-Results/Chair-groups/Environmental-Sciences/Laboratory-of-Geo-information-Science-and-Remote-Sensing/Research/Sensing-measuring/RADD-Forest-Disturbance-Alert.htm

// //---------------------------
// //Access RADD image collection
// //---------------------------
// var radd = ee.ImageCollection('projects/radar-wur/raddalert/v1');
// var geography = 'africa' // 'africa' (africa), 'asia' (asia & pacific)

// print('RADD image collection:', radd)

// //----------------------------------------
// //Forest baseline 
// //Primary humid tropical forest mask 2001 from Turubanova et al (2018) with annual (Africa: 2001-2018; Asia: 2001 - 2019) forest loss (Hansen et al 2013) and mangroves (Bunting et al 2018) removed
// //----------------------------------------
// var forest_baseline = ee.Image(radd.filterMetadata('layer','contains','forest_baseline')
//                             .filterMetadata('geography','contains',geography).first())

// print('Forest baseline '+ geography + ':',  forest_baseline)

// Map.addLayer(forest_baseline, {palette:['black'], opacity: 0.3},'Forest baseline')

// //-----------------
// //Latest RADD alert
// //-----------------
// var latest_radd_alert =  ee.Image(radd.filterMetadata('layer','contains','alert')
//                             .filterMetadata('geography','contains',geography)
//                             .sort('system:time_end', false).first());

// print('Latest RADD alert '+ geography+':',latest_radd_alert)

// //RADD alert: 2 = unconfirmed (low confidence) alert; 3 = confirmed (high confidence) alert
// Map.addLayer(latest_radd_alert.select('Alert'), {min:2,max:3,palette:['blue','coral']}, 'RADD alert')

// //RADD alert date: YYDOY (Year-Year-Day-Of-Year)
// Map.addLayer(latest_radd_alert.select('Date'), {min:19000,max:21000, palette: ['ffffcc','800026']}, 'RADD alert date')

// Map.setOptions('Satellite');