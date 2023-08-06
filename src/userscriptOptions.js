import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";

const App = () => {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!document.querySelector("header")) {
        setLoading(false);
      }
    }, 5000);
    return () => {
      clearTimeout(timer);
    };
  }, []);

  if (loading) {
    return (
      <center>
        <p>KISS Translator</p>
        <h1 style={{ textAlign: "center" }}>loading...</h1>
      </center>
    );
  }

  return (
    <center>
      <p>
        <a href={process.env.REACT_APP_HOMEPAGE}>KISS Translator</a> Script not
        installed or disabled!
      </p>
      <h1>
        <a href={process.env.REACT_APP_HOMEPAGE}>Click here read more!</a>
      </h1>
    </center>
  );
};

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
