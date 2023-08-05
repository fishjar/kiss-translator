import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";

const App = () => {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!document.querySelector("header")) {
        setLoading(false);
      }
    }, 3000);
    return () => {
      clearTimeout(timer);
    };
  }, []);

  if (loading) {
    return <p style={{ textAlign: "center" }}>loading...</p>;
  }

  return (
    <div style={{ textAlign: "center" }}>
      <p>
        <a href={process.env.REACT_APP_HOMEPAGE}>KISS Translator</a> Script not
        installed or disabled!
      </p>
      <p>
        <a href={process.env.REACT_APP_HOMEPAGE}>Click here read more!</a>
      </p>
    </div>
  );
};

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
