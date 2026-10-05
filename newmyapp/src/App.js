import "./App.css";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import WelcomePage from "./components/WelcomePage";
import HomePage from "./components/HomePage";
import Login from "./components/Login";
import Signup from "./components/SignUp";
import DashboardInterview from "./components/DashboardInterview";

const router = createBrowserRouter([
    {
      path: "/",
      element: (
        <>
          <WelcomePage />
        </>
      ),
    },
    {
      path: "/dashboard",
      element: (
        <>
          <HomePage />
        </>
      ),
    },
    {
      path: "/dashboardmain",
      element: (
        <>
          <DashboardInterview/>
        </>
      ),
    },
    {
      path: "/login",
      element: (
        <>
          <Login/>
        </>
      ),
    },
    {
      path: "/signup",
      element: (
        <>
          <Signup/>
        </>
      ),
    },
  ]);

function App() {
  return (
    <>
      <RouterProvider router={router} />
    </>
  );
}

export default App;
