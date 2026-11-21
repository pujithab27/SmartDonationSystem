import test from "node:test";
import assert from "node:assert/strict";
import { donorImpact } from "../lib/impact.js";
test("impact counts only confirmed receipts and keeps unlike units separate", () => {
  const rows = [
    {status:"Completed",name:"Rice",unit:"kg",quantity:"2.5",ngoName:"Kitchen",completedAt:"2026-11-20"},
    {status:"Completed",name:"Rice",unit:"kg",quantity:"3",ngoName:"Kitchen",completedAt:"2026-11-21"},
    {status:"Completed",name:"Books",unit:"piece",quantity:"4",ngoName:"School",completedAt:"2026-11-19"},
    {status:"Cancelled",name:"Rice",unit:"kg",quantity:20},
    {status:"Pickup scheduled",name:"Rice",unit:"kg",quantity:10},
  ];
  const impact = donorImpact(rows);
  assert.equal(impact.completed.length,3);
  assert.equal(impact.organizations,2);
  assert.equal(impact.inProgress,1);
  assert.equal(impact.quantities.find(item=>item.name==="Rice").quantity,5.5);
  assert.equal(impact.quantities.find(item=>item.name==="Books").quantity,4);
  assert.equal(impact.completed[0].completedAt,"2026-11-21");
  assert.equal(donorImpact().completed.length,0);
});
