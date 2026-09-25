import { Navigate, Route, Routes } from "react-router-dom";
import { Shell } from "./components/Shell";
import { ToastHost } from "./components/Toast";
import Login from "./pages/Login";
import Decks from "./pages/Decks";
import NewDeck from "./pages/NewDeck";
import Editor from "./pages/Editor";
import Present from "./pages/Present";
import Settings from "./pages/Settings";

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/deck/:id/present" element={<Present />} />
        <Route element={<Shell />}>
          <Route path="/" element={<Decks />} />
          <Route path="/new" element={<NewDeck />} />
          <Route path="/deck/:id" element={<Editor />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <ToastHost />
    </>
  );
}
