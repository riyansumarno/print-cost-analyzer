import assert from 'node:assert/strict';
import {
  buildPrintJob,
  chooseNupLayout,
  getNupSlotOrder,
  parsePageRange,
  selectPages,
} from '../assets/js/print-job.js';

const analysis = {pages:[
  {page:1,type:'H',ink_coverage:10},
  {page:2,type:'HW',color_coverage:8,strong_color_coverage:2,ink_coverage:20,raster_image_area:10},
  {page:3,type:'W',color_coverage:30,strong_color_coverage:10,ink_coverage:50,raster_image_area:35,active_color_blocks:50},
  {page:4,type:'H',ink_coverage:10},
  {page:5,type:'W',color_coverage:28,strong_color_coverage:8,ink_coverage:45,raster_image_area:30,active_color_blocks:45},
  {page:6,type:'H',ink_coverage:10},
  {page:7,type:'H',ink_coverage:10},
  {page:8,type:'H',ink_coverage:10},
  {page:9,type:'H',ink_coverage:10},
  {page:10,type:'HW',color_coverage:7,strong_color_coverage:2,ink_coverage:18,raster_image_area:8},
]};

let assertions = 0;
const eq=(a,b)=>{assert.equal(a,b);assertions++;};
const deep=(a,b)=>{assert.deepEqual(a,b);assertions++;};

let job = buildPrintJob(8,{pagesPerSide:2,duplex:true},analysis);
eq(job.printedSides,4);
eq(job.physicalSheets,2);
deep(job.sheets[0].front.pages,[1,2]);
eq(job.sheets[0].front.type,'HW');
eq(job.sheets[0].back.type,'W');

job=buildPrintJob(5,{pagesPerSide:2,duplex:true},analysis);
eq(job.physicalSheets,2);
eq(job.sheets[1].back,null);

job=buildPrintJob(8,{pagesPerSide:1,duplex:true,colorMode:'front-back',frontColor:'bw',backColor:'color'},analysis);
eq(job.sheets[0].front.type,'H');
eq(job.sheets[0].back.type,'W');

job=buildPrintJob(8,{pagesPerSide:4},analysis);
eq(job.sheets[0].front.type,'HW');

job=buildPrintJob(8,{pagesPerSide:2,duplex:true,colorMode:'bw',copies:3},analysis);
eq(job.sideCounts.H,12);
eq(job.totalPhysicalSheets,6);
eq(job.totalCost,3600);

eq(chooseNupLayout(4,'auto',.707).rows*chooseNupLayout(4,'auto',.707).cols,4);

const parsed=parsePageRange('1-3, 7, 10-8, x',10);
deep(parsed.pages,[1,2,3,7,10,9,8]);
deep(parsed.invalidTokens,['x']);

deep(selectPages(10,{pageRangeMode:'custom',pageRange:'1-6',pageSubset:'odd'}).pages,[1,3,5]);
deep(selectPages(6,{pageOrder:'reverse'}).pages,[6,5,4,3,2,1]);

job=buildPrintJob(10,{pageRangeMode:'custom',pageRange:'2-5',pagesPerSide:2,duplex:true},analysis);
eq(job.selectedPageCount,4);
deep(job.sheets[0].front.pages,[2,3]);
deep(job.sheets[0].back.pages,[4,5]);

job=buildPrintJob(8,{layoutMode:'booklet'},analysis);
eq(job.settings.pagesPerSide,2);
eq(job.settings.duplex,true);
eq(job.settings.orientation,'landscape');
eq(job.physicalSheets,2);
deep(job.sheets[0].front.pages,[8,1]);
deep(job.sheets[0].back.pages,[2,7]);
deep(job.sheets[1].front.pages,[6,3]);
deep(job.sheets[1].back.pages,[4,5]);

job=buildPrintJob(6,{layoutMode:'booklet'},analysis);
eq(job.addedBlankPages,2);
eq(job.physicalSheets,2);
deep(job.sheets[0].front.pages,[null,1]);
deep(job.sheets[0].back.pages,[2,null]);

job=buildPrintJob(8,{layoutMode:'booklet',bookletBinding:'right'},analysis);
deep(job.sheets[0].front.pages,[1,8]);
deep(job.sheets[0].back.pages,[7,2]);

job=buildPrintJob(8,{pagesPerSide:1,duplex:true,colorMode:'custom'},analysis,{H:300,HW:500,W:1000},{'1:front':'W','1:back':'H'});
eq(job.sheets[0].front.type,'W');
eq(job.sheets[0].back.type,'H');
eq(job.sheets[0].front.forced,true);

eq(job.totalCost > 0,true);

job=buildPrintJob(8,{pagesPerSide:2,duplex:true,duplexMethod:'manual',copies:2,collate:false},analysis);
eq(job.settings.duplexMethod,'manual');
eq(job.settings.collate,false);
eq(job.totalPhysicalSheets,4);

deep(getNupSlotOrder(2,2,'ltr'),[0,1,2,3]);
deep(getNupSlotOrder(2,2,'rtl'),[1,0,3,2]);
deep(getNupSlotOrder(2,2,'ttb'),[0,2,1,3]);

job=buildPrintJob(10,{pageRangeMode:'custom',pageRange:'99'},analysis);
eq(job.selectedPageCount,0);
eq(job.physicalSheets,0);
deep(job.invalidRangeTokens,['99']);

console.log(`print-job: ${assertions} assertions passed`);
