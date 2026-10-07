import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import Home from "@/pages/Home";
import CreateRegister from "@/pages/CreateRegister";
import RegisterView from "@/pages/RegisterView";
import NewDay from "@/pages/NewDay";

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/new" element={<CreateRegister />} />
          <Route path="/register/:id" element={<RegisterView />} />
          <Route path="/register/:id/new" element={<NewDay />} />
          <Route path="/register/:id/entry/:entryId" element={<NewDay />} />
        </Routes>
      </BrowserRouter>
      <Toaster position="top-center" richColors />
    </div>
  );
}

export default App;
