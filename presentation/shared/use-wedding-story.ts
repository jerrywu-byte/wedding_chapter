"use client";
import {useState} from "react";
import {previewQuestion,type PrototypeScreen} from "./experience-adapter";
export function useWeddingStory(initial:PrototypeScreen="opening"){const[screen,setScreen]=useState<PrototypeScreen>(initial);const[selectedOptionId,setSelectedOptionId]=useState(previewQuestion.options[0].optionId);return{screen,setScreen,selectedOptionId,setSelectedOptionId}}
