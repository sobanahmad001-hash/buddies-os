"use client";
import {useEffect,useState} from "react";
import ExperimentResults from "./ExperimentResults";
import {labApi,panelClass} from "./manual-ui";
export default function SelectedExperimentResults({id}:{id:string|null}) {
  const [detail,setDetail]=useState<any>(null),[error,setError]=useState("");
  const reload=async()=>{if(id)setDetail(await labApi(`experiments?id=${encodeURIComponent(id)}`));};
  useEffect(()=>{let active=true;setDetail(null);setError("");if(id)labApi(`experiments?id=${encodeURIComponent(id)}`).then(x=>{if(active)setDetail(x);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[id]);
  if(error)return <p role="alert" className={panelClass}>{error}</p>;
  return detail?<ExperimentResults detail={detail} onSaved={reload}/>:<p className={panelClass}>{id?"Loading experiment evidence…":"Select a working experiment to compare analysis combinations and review its sample."}</p>;
}
