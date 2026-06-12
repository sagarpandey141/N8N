import React from 'react'
import LeftModule from './LeftModule'
import CentralConsole from "./Centerconsole"
import RightModule from "./Rightmodule"

const Centralize = () => {
  return (
    <div className=' w-full h-full p-2 font-mono flex flex-row '>
         <LeftModule/>
         <CentralConsole/>
         <RightModule/>
    </div>
  )
}

export default Centralize