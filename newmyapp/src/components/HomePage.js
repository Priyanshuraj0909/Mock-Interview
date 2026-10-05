import { useState, useEffect } from "react";
import PurposeForm from "./PurposeForm";
import MockTest from "./MockTest";
import Results from "./Results";
import { FaUser, FaRobot } from "react-icons/fa";
import { Link } from "react-router-dom";

export default function HomePage() {
  const [step, setStep] = useState("purpose");
  const [testParams, setTestParams] = useState(null);
  const [results, setResults] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [aiThinking, setAiThinking] = useState(false);
  const [conversation, setConversation] = useState([]);
  const mousePosition = { x: 0, y: 0 };

  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const formatTime = (date) => {
    return date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  const handlePurposeSubmit = (params) => {
    setIsLoading(true);
    setAiThinking(true);

    // Add user query to conversation
    addToConversation(
      "user",
      `Generate a mock test for ${params.subject} at ${params.difficulty} level with 10 questions`
    );

    // Simulate AI thinking
    setTimeout(() => {
      setAiThinking(false);
      addToConversation(
        "ai",
        `I've prepared a custom ${params.subject} mock test with 10 questions at ${params.difficulty} difficulty. Ready to start?`
      );
      setTestParams(params);
      setIsLoading(false);
      setTimeout(() => setStep("test"), 1000);
    }, 2000);
  };
  const logout = () => {
    ["token", "user", "useremail"].forEach((key) => localStorage.removeItem(key));
    window.location.href = "/"; // Redirect to the home or login page
  };
  const handleTestComplete = (resultData) => {
    setIsLoading(true);
    setAiThinking(true);

    // Add completion message to conversation
    addToConversation(
      "user",
      "I ve finished the test. Please analyze my results."
    );

    // Simulate AI analyzing results
    setTimeout(() => {
      setAiThinking(false);
      addToConversation(
        "ai",
        `I've analyzed your results. You scored ${resultData.score}% with ${resultData.correctAnswers} correct answers out of ${resultData.correctAnswers + resultData.incorrectAnswers}. Let me provide you with detailed feedback.`
      );
      setResults(resultData);
      setIsLoading(false);
      setTimeout(() => setStep("results"), 1000);
    }, 2500);
  };

  const restartTest = () => {
    setIsLoading(true);
    addToConversation("user", "I'd like to try another test.");

    setTimeout(() => {
      addToConversation(
        "ai",
        "Sure! Let's set up a new mock test for you. What subject would you like to practice?"
      );
      setTestParams(null);
      setResults(null);
      setIsLoading(false);
      setStep("purpose");
    }, 1500);
  };

  const addToConversation = (sender, message) => {
    setConversation((prev) => [
      ...prev,
      { sender, message, timestamp: new Date() },
    ]);
  };

  // Auto-scroll to bottom of conversation
  useEffect(() => {
    const convoElement = document.getElementById("conversation-container");
    if (convoElement) {
      convoElement.scrollTop = convoElement.scrollHeight;
    }
  }, [conversation]);
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-950 to-gray-900 text-gray-100 relative overflow-hidden">
      {/* Dynamic background gradient */}
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(circle at ${mousePosition.x}px ${mousePosition.y}px, rgba(59, 130, 246, 0.2), transparent 50%)`,
          transition: "background 0.3s ease-out",
        }}
      />

      {/* Soft Waves Animation */}
      <div className="absolute inset-0 opacity-10">
        <svg className="absolute bottom-0 w-full h-32">
          <defs>
            <linearGradient
              id="wave-gradient"
              x1="0%"
              y1="0%"
              x2="100%"
              y2="0%"
            >
              <stop offset="0%" stopColor="rgba(59, 130, 246, 0.3)" />
              <stop offset="100%" stopColor="transparent" />
            </linearGradient>
          </defs>
          <path
            d="M0,100 C150,50 350,150 500,100 C650,50 850,150 1000,100 L1000,200 L0,200 Z"
            fill="url(#wave-gradient)"
            opacity="0.5"
          >
            <animateTransform
              attributeName="transform"
              type="translate"
              from="0 0"
              to="-100 0"
              dur="10s"
              repeatCount="indefinite"
            />
          </path>
        </svg>
      </div>

      {/* Header with glass morphism */}
      <header className="border-b border-gray-700/40 backdrop-blur-md bg-gray-900/60 p-4 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          {/* Title */}
          <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500">
            AI Mock Test Generator
          </h1>

          {/* Right Section */}
          <div className="flex items-center space-x-6">
            <span>{localStorage.getItem("useremail")}</span>
            {/* AI Active Indicator */}
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 rounded-full bg-green-400 animate-pulse shadow-lg shadow-green-400/30"></div>
              <span className="text-green-400 font-medium">AI Active</span>
            </div>

            {/* Real-Time Clock */}
            <div className="text-gray-300 font-mono text-sm bg-gray-800 px-3 py-1 rounded-md shadow">
              {formatTime(time)}
            </div>
            <Link to="/dashboardmain" className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-md transition duration-200">
            Interview
            </Link>
            {/* Logout Button */}
            <button
              onClick={logout}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-md transition duration-200"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <div className="max-w-8xl mx-auto p-4 md:p-8 flex flex-col md:flex-row gap-6 relative z-10">
        {/* Left sidebar - conversation history */}
        <div className="w-full md:w-1/3 bg-gray-900/80 backdrop-blur-lg rounded-lg p-4 h-[calc(100vh-160px)] flex flex-col border border-gray-700/50 shadow-2xl shadow-violet-500">
          <h2 className="text-xl font-semibold mb-4 text-transparent bg-clip-text bg-gradient-to-r from-blue-300 to-blue-500">
            AI Chat
          </h2>

          <div
            id="conversation-container"
            className="flex-grow overflow-y-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-transparent flex flex-col items-start px-2"
          >
            {conversation.length === 0 ? (
              <div className="w-full flex flex-col items-center justify-start mt-6">
                <FaRobot className="text-blue-400 w-10 h-10 mb-2" />
                <div className="max-w-[80%] p-3 rounded-2xl bg-gray-700 text-gray-300 shadow-lg">
                  <div className="text-sm font-medium mb-1">AI Assistant</div>
                  <div className="text-sm">
                    Hi! 👋 I'm your AI assistant. How can I help you today?
                  </div>
                </div>

                <div className="mt-4 max-w-[80%] p-3 rounded-2xl bg-gray-800/80 text-gray-400 shadow-md italic text-sm">
                  💡 Try asking: <br />
                  <span className="text-blue-400">
                    "Tell me an interesting fact!"
                  </span>
                </div>
              </div>
            ) : (
              <div className="w-full">
                {conversation.map((msg, index) => (
                  <div
                    key={index}
                    className={`mb-4 flex items-start ${
                      msg.sender === "user" ? "justify-end" : "justify-start"
                    }`}
                  >
                    {msg.sender === "ai" && (
                      <FaRobot className="text-blue-400 w-6 h-6 mr-2" />
                    )}
                    <div
                      className={`max-w-[75%] p-3 rounded-2xl shadow-lg ${
                        msg.sender === "user"
                          ? "bg-blue-600 text-white ml-auto"
                          : "bg-gray-700 text-gray-300"
                      }`}
                    >
                      <div className="text-sm font-medium mb-1">
                        {msg.sender === "user" ? "You" : "AI Assistant"}
                      </div>
                      <div className="text-sm">{msg.message}</div>
                    </div>
                    {msg.sender === "user" && (
                      <FaUser className="text-white w-6 h-6 ml-2" />
                    )}
                  </div>
                ))}

                {aiThinking && (
                  <div className="mb-4 flex items-start">
                    <FaRobot className="text-blue-400 w-6 h-6 mr-2" />
                    <div className="p-3 rounded-2xl bg-gray-700 text-gray-300 shadow-lg">
                      <div className="text-sm font-medium mb-1">
                        AI Assistant
                      </div>
                      <div className="flex items-center space-x-2">
                        <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce"></div>
                        <div
                          className="w-2 h-2 bg-blue-400 rounded-full animate-bounce"
                          style={{ animationDelay: "0.2s" }}
                        ></div>
                        <div
                          className="w-2 h-2 bg-blue-400 rounded-full animate-bounce"
                          style={{ animationDelay: "0.4s" }}
                        ></div>
                        <span className="text-gray-400">Thinking...</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right content area - forms and tests */}
        <div className="w-full md:w-2/3 bg-gray-800/80 backdrop-blur-sm rounded-lg p-6 h-[calc(100vh-160px)] overflow-y-auto border border-gray-700/50 shadow-xl shadow-violet-500 relative">
          <div
            className={`transition-opacity duration-300 ${
              isLoading ? "opacity-50" : "opacity-100"
            }`}
          >
            {step === "purpose" && (
              <PurposeForm onSubmit={handlePurposeSubmit} />
            )}
            {step === "test" && (
              <MockTest params={testParams} onComplete={handleTestComplete} />
            )}
            {step === "results" && (
              <Results data={results} onRestart={restartTest} />
            )}
          </div>
        </div>
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-16 h-16 border-4 border-blue-400 border-t-transparent rounded-full animate-spin shadow-lg shadow-blue-400/20"></div>
          </div>
        )}
      </div>
    </div>
  );
}
