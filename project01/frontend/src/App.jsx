import { useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from './assets/vite.svg'
import heroImg from './assets/hero.png'
import Flow from './component/flow'
import './App.css'
import Navbar from './component/Navbar'
import Centralize from './component/Centralize'


function App() {
  const [count, setCount] = useState(0)

  return (
    <div className='w-full h-screen overflow-hidden bg-gray-900 text-white'>
         <Navbar/>
         <Centralize/>
    </div>
  )
}

export default App
