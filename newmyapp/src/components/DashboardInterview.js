import React from "react";
import { useEffect, useState, useRef } from "react";
import { Link } from "react-router-dom";

import { API_BASE_URL as BASE_URL } from "../services/api";

const API_BASE_URL = `${BASE_URL}/interview`;

const interviewService = {
    generateQuestions: async (interviewType, jobDescription = "", difficultyLevel = 3) => {
        const response = await fetch(`${API_BASE_URL}/generate-questions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            interviewType,
            jobDescription,
            difficultyLevel,
          }),
        });
        
        if (!response.ok) {
          const error = await response.json().catch(() => ({}));
          throw new Error(error.detail || "Failed to generate questions");
        }
        
        const data = await response.json();
        return data; // This will be the object with the questions property
      },
  
  evaluateAnswer: async (interviewType, question, answer) => {
    const response = await fetch(`${API_BASE_URL}/evaluate-answer`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        interviewType,
        question,
        answer,
      }),
    });
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.detail || "Failed to evaluate answer");
    }
    
    return response.json();
  },
};

export default function DashboardInterview() {
  const [time, setTime] = useState(new Date());
  const [isAISpeaking, setIsAISpeaking] = useState(false);
  const [interviewState, setInterviewState] = useState("setup"); // setup, waiting, asking, listening, feedback, complete
  const [userAnswer, setUserAnswer] = useState("");
  const [feedback, setFeedback] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Voice recognition references and state
  const speechSynthesisRef = useRef(window.speechSynthesis);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef(null);
  const [voiceEnabled, setVoiceEnabled] = useState(true);

  // Interview configuration
  const [interviewType, setInterviewType] = useState("software_engineer");
  const [jobDescription, setJobDescription] = useState("");
  const [difficultyLevel, setDifficultyLevel] = useState(3);

  // Questions and current question tracking
  const [questions, setQuestions] = useState([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [completedQuestions, setCompletedQuestions] = useState([]);

  // Initialize speech recognition
  useEffect(() => {
    const synthesis = speechSynthesisRef.current;
    if ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;
      
      recognitionRef.current.onresult = (event) => {
        const transcript = Array.from(event.results)
          .map(result => result[0])
          .map(result => result.transcript)
          .join('');
        
        setUserAnswer(transcript);
      };
      
      recognitionRef.current.onerror = (event) => {
        console.error('Speech recognition error', event.error);
        setIsListening(false);
      };
      
      recognitionRef.current.onend = () => {
        setIsListening(false);
      };
    } else {
      setVoiceEnabled(false);
    }
    
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      
      if (synthesis) {
        synthesis.cancel();
      }
    };
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    // Simulate AI speaking when state changes to asking
    if (interviewState === "asking") {
      setIsAISpeaking(true);
      
      if (voiceEnabled && questions.length > 0 && currentQuestionIndex < questions.length) {
        speakQuestion(questions[currentQuestionIndex].text);
      }
      
      const speakTimer = setTimeout(() => {
        setIsAISpeaking(false);
        setInterviewState("listening");
      }, 3000);
      
      return () => clearTimeout(speakTimer);
    }
  }, [interviewState, questions, currentQuestionIndex, voiceEnabled]);

  const speakQuestion = (text) => {
    if (speechSynthesisRef.current) {
      speechSynthesisRef.current.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1;
      utterance.pitch = 1;
      
      utterance.onstart = () => {
        setIsAISpeaking(true);
      };
      
      utterance.onend = () => {
        setIsAISpeaking(false);
        setInterviewState("listening");
      };
      
      speechSynthesisRef.current.speak(utterance);
    }
  };

  const toggleVoiceInput = () => {
    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      recognitionRef.current.start();
      setIsListening(true);
    }
  };

  const formatTime = (date) => {
    return date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  const logout = () => {
    localStorage.removeItem("useremail");
  };

  const handleGenerateQuestions = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await interviewService.generateQuestions(
        interviewType,
        jobDescription,
        difficultyLevel
      );
      
      // Access the questions array from the response
      setQuestions(response.questions);
      setInterviewState("waiting");
    } catch (err) {
      setError("Failed to generate questions: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleStartInterview = () => {
    setInterviewState("asking");
  };

  const handleSubmitAnswer = async () => {
    if (!userAnswer.trim()) {
      return;
    }
    
    // Stop listening if active
    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
    }
    
    try {
      setLoading(true);
      setError(null);
      
      // Evaluate the answer
      const evaluationResult = await interviewService.evaluateAnswer(
        interviewType,
        questions[currentQuestionIndex].text,
        userAnswer
      );
      
      setFeedback(evaluationResult);
      
      // Save completed question and answer
      setCompletedQuestions([
        ...completedQuestions,
        {
          question: questions[currentQuestionIndex],
          answer: userAnswer,
          feedback: evaluationResult
        }
      ]);
      
      setInterviewState("feedback");
    } catch (err) {
      setError("Failed to evaluate answer: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleNextQuestion = () => {
    if (currentQuestionIndex + 1 >= questions.length) {
      // End of interview
      setInterviewState("complete");
    } else {
      // Move to next question
      setCurrentQuestionIndex(currentQuestionIndex + 1);
      setUserAnswer("");
      setFeedback(null);
      setInterviewState("asking");
    }
  };

  const resetInterview = () => {
    setInterviewState("setup");
    setQuestions([]);
    setCurrentQuestionIndex(0);
    setCompletedQuestions([]);
    setUserAnswer("");
    setFeedback(null);
    
    // Ensure speech is stopped
    if (speechSynthesisRef.current) {
      speechSynthesisRef.current.cancel();
    }
    
    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
    }
  };

  const currentQuestion = questions.length > 0 && currentQuestionIndex < questions.length 
    ? questions[currentQuestionIndex].text 
    : "No questions available";
  
  // Calculate total score from all questions
  const totalScore = completedQuestions.reduce((sum, q) => sum + (q.feedback?.score || 0), 0);
  const averageScore = completedQuestions.length > 0 
    ? Math.round((totalScore / completedQuestions.length) * 10) / 10 
    : 0;

  return (
    <div className="min-h-screen min-w-screen bg-gradient-to-b from-gray-950 to-gray-900 text-gray-100 relative overflow-hidden">
      {/* Dynamic background gradient */}
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(circle at 50% 50%, rgba(59, 130, 246, 0.2), transparent 50%)`,
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
      
      <header className="w-full border-b border-gray-700/40 backdrop-blur-md bg-gray-900/80 p-4 fixed top-0 z-50">
        <div className="container mx-auto flex flex-wrap justify-between items-center">
          {/* Title */}
          <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500">
            AI Mock Interview
          </h1>

          {/* Right Section */}
          <div className="flex items-center space-x-6">
            {/* User Email */}
            <span className="text-gray-300 font-semibold">
              {localStorage.getItem("useremail")}
            </span>

            {/* AI Active Indicator */}
            <div className="flex items-center space-x-2">
              <div className={`w-3 h-3 rounded-full ${loading || isAISpeaking ? 'bg-green-400 animate-pulse' : 'bg-gray-500'} shadow-lg shadow-green-400/30`}></div>
              <span className={`${loading || isAISpeaking ? 'text-green-400' : 'text-gray-500'} font-medium`}>
                {loading || isAISpeaking ? 'AI Active' : 'AI Idle'}
              </span>
            </div>

            {/* Real-Time Clock */}
            <div className="text-gray-300 font-mono text-sm bg-gray-800 px-3 py-1 rounded-md shadow">
              {formatTime(time)}
            </div>
            <Link to="/dashboard"
            
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-md transition duration-200">
                Test Mode
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
      
      <div className="pt-24 min-h-screen flex flex-col md:flex-row p-6 gap-6">
        {/* Left side - AI Avatar */}
        <div className="w-full md:w-1/2 flex flex-col items-center justify-center bg-gray-800/30 rounded-2xl p-6 backdrop-blur-sm border border-gray-700/40">
          <div className="relative w-64 h-64 mb-6">
            {/* AI Avatar Circle */}
            <div className="absolute inset-0 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 shadow-lg shadow-blue-500/30 flex items-center justify-center overflow-hidden">
              {/* AI Face */}
              <div className="relative w-56 h-56 rounded-full bg-gray-900 flex items-center justify-center">
                {/* AI Eyes */}
                <div className="flex space-x-8">
                  <div className="w-8 h-8 rounded-full bg-blue-400 shadow-inner shadow-blue-300">
                    <div className={`w-4 h-4 rounded-full bg-gray-900 relative top-2 left-2 ${isAISpeaking ? 'animate-pulse' : ''}`}></div>
                  </div>
                  <div className="w-8 h-8 rounded-full bg-blue-400 shadow-inner shadow-blue-300">
                    <div className={`w-4 h-4 rounded-full bg-gray-900 relative top-2 left-2 ${isAISpeaking ? 'animate-pulse' : ''}`}></div>
                  </div>
                </div>
                
                {/* AI Mouth - Animated when speaking */}
                <div className="absolute bottom-16 w-20 h-2 rounded-full overflow-hidden">
                  {isAISpeaking ? (
                    <div className="w-full bg-blue-400">
                      <div className="w-full h-4 bg-blue-400 animate-bounce"></div>
                    </div>
                  ) : (
                    <div className="w-full h-1 bg-blue-400"></div>
                  )}
                </div>
              </div>
            </div>
            
            {/* Animated circles around AI */}
            <div className="absolute inset-0 -z-10">
              <div className="absolute inset-0 rounded-full border-4 border-blue-500/20 animate-ping" style={{animationDuration: "3s"}}></div>
              <div className="absolute inset-0 rounded-full border-4 border-purple-500/10 animate-ping" style={{animationDuration: "4s"}}></div>
            </div>
          </div>
          
          {/* AI Status */}
          <div className="bg-gray-900/60 rounded-lg px-4 py-2 shadow-inner text-center">
            <p className="text-gray-300 mb-2">AI Interview Assistant</p>
            <p className="text-blue-400 font-semibold">
              {interviewState === "setup" && "Configure your interview"}
              {interviewState === "waiting" && "Ready to start interview"}
              {interviewState === "asking" && "Asking question..."}
              {interviewState === "listening" && "Listening to your answer..."}
              {interviewState === "feedback" && "Analyzing response..."}
              {interviewState === "complete" && "Interview completed!"}
            </p>
          </div>
          
          {/* Voice Controls */}
          <div className="mt-4 w-full max-w-md">
            <div className="flex items-center justify-between bg-gray-900/60 rounded-lg p-3">
              <span className="text-gray-300 font-medium">Voice Interaction</span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={voiceEnabled} 
                  onChange={() => setVoiceEnabled(!voiceEnabled)} 
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>
          </div>
          
          {/* Progress */}
          {questions.length > 0 && (
            <div className="w-full max-w-md mt-4 bg-gray-900/60 rounded-lg p-4">
              <div className="flex justify-between mb-1">
                <span className="text-sm font-medium text-blue-400">Progress</span>
                <span className="text-sm font-medium text-gray-300">
                  {currentQuestionIndex + 1}/{questions.length}
                </span>
              </div>
              
              {completedQuestions.length > 0 && (
                <div className="mt-2 text-center text-sm text-gray-300">
                  Average Score: <span className="font-bold">{averageScore}/10</span>
                </div>
              )}
            </div>
          )}
          
          {/* Interview Controls */}
          <div className="mt-8 flex flex-col gap-4 w-full max-w-md">
            {interviewState === "setup" && (
              <>
                <div className="space-y-4 w-full">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Interview Type</label>
                    <select
                      value={interviewType}
                      onChange={(e) => setInterviewType(e.target.value)}
                      className="w-full p-2 bg-gray-700 border border-gray-600 rounded-md text-white"
                    >
                      <option value="software_engineer">Software Engineer</option>
                      <option value="frontend_developer">Frontend Developer</option>
                      <option value="backend_developer">Backend Developer</option>
                      <option value="fullstack_developer">Fullstack Developer</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Difficulty Level</label>
                    <select
                      value={difficultyLevel}
                      onChange={(e) => setDifficultyLevel(parseInt(e.target.value))}
                      className="w-full p-2 bg-gray-700 border border-gray-600 rounded-md text-white"
                    >
                      <option value="1">Beginner</option>
                      <option value="2">Intermediate</option>
                      <option value="3">Advanced</option>
                      <option value="4">Expert</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Job Description (Optional)</label>
                    <textarea
                      value={jobDescription}
                      onChange={(e) => setJobDescription(e.target.value)}
                      className="w-full p-2 bg-gray-700 border border-gray-600 rounded-md text-white"
                      placeholder="Paste job description here for customized questions..."
                      rows="3"
                    />
                  </div>
                </div>
                
                <button 
                  onClick={handleGenerateQuestions}
                  disabled={loading}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition duration-200 shadow-lg shadow-blue-600/20 disabled:opacity-50"
                >
                  {loading ? 'Generating Questions...' : 'Generate Questions'}
                </button>
              </>
            )}
            
            {interviewState === "waiting" && (
              <button 
                onClick={handleStartInterview}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition duration-200 shadow-lg shadow-blue-600/20"
              >
                Start Interview
              </button>
            )}
            
            {interviewState === "feedback" && (
              <button 
                onClick={handleNextQuestion}
                className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg transition duration-200 shadow-lg shadow-purple-600/20"
              >
                {currentQuestionIndex + 1 < questions.length ? 'Next Question' : 'Finish Interview'}
              </button>
            )}
            
            {interviewState === "complete" && (
              <button 
                onClick={resetInterview}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition duration-200 shadow-lg shadow-blue-600/20"
              >
                Start New Interview
              </button>
            )}
            
            {error && (
              <div className="mt-2 p-3 bg-red-900/50 text-red-200 rounded-md text-sm">
                {error}
              </div>
            )}
          </div>
        </div>
        
        {/* Right side - Question & Answer */}
        <div className="w-full md:w-1/2 flex flex-col rounded-2xl overflow-hidden border border-gray-700/40">
          {/* Question Section */}
          <div className="bg-gray-800/50 backdrop-blur-sm p-6 border-b border-gray-700/40">
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-xl font-bold text-blue-400">Question:</h2>
              {/* Play button to repeat question */}
              {interviewState !== "setup" && interviewState !== "waiting" && (
                <button 
                  onClick={() => speakQuestion(currentQuestion)}
                  disabled={isAISpeaking}
                  className="p-2 bg-blue-600/20 hover:bg-blue-600/40 rounded-full text-blue-400 transition duration-200"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                  </svg>
                </button>
              )}
            </div>
            <div className="p-4 bg-gray-900/60 rounded-lg shadow-inner">
              {interviewState === "setup" ? (
                <p className="text-gray-400 italic">Configure your interview settings to generate questions</p>
              ) : (
                <p className="text-gray-200">{currentQuestion}</p>
              )}
            </div>
          </div>
          
          {/* Answer Section */}
          <div className="flex-grow bg-gray-800/30 backdrop-blur-sm p-6 flex flex-col">
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-xl font-bold text-purple-400">Your Answer:</h2>
              
              {/* Voice control buttons (only visible when in listening state) */}
              {interviewState === "listening" && voiceEnabled && (
                <button
                  onClick={toggleVoiceInput}
                  className={`p-2 ${isListening ? 'bg-red-600/20 hover:bg-red-600/40 text-red-400' : 'bg-green-600/20 hover:bg-green-600/40 text-green-400'} rounded-full transition duration-200`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                </button>
              )}
            </div>
            
            {interviewState === "feedback" || interviewState === "complete" ? (
              <div className="flex-grow p-4 bg-gray-900/60 rounded-lg shadow-inner overflow-y-auto">
                <p className="text-gray-200">{userAnswer}</p>
              </div>
            ) : (
              <div className="flex-grow flex flex-col">
                <textarea
                  className="flex-grow p-4 bg-gray-900/60 rounded-lg shadow-inner text-gray-200 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  placeholder={interviewState === "setup" 
                    ? "Answer will appear here once interview starts" 
                    : isListening 
                      ? "Listening to your voice... Speak now" 
                      : "Type your answer here or click the microphone to speak..."
                  }
                  value={userAnswer}
                  onChange={(e) => setUserAnswer(e.target.value)}
                  disabled={interviewState === "setup" || interviewState === "waiting" || interviewState === "asking" || isListening}
                />
                
                {/* Voice indicator when active */}
                {isListening && (
                  <div className="mt-2 p-2 bg-green-900/20 text-green-400 text-center rounded-md text-sm">
                    <div className="flex justify-center items-center">
                      <span>Listening</span>
                      <span className="ml-2 flex space-x-1">
                        <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" style={{ animationDelay: "0ms" }}></span>
                        <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" style={{ animationDelay: "200ms" }}></span>
                        <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" style={{ animationDelay: "400ms" }}></span>
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
            
            {interviewState === "listening" && (
              <button
                onClick={handleSubmitAnswer}
                disabled={loading}
                className="mt-4 py-3 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition duration-200 shadow-lg shadow-green-600/20 disabled:opacity-50"
              >
                {loading ? 'Processing...' : 'Submit Answer'}
              </button>
            )}
            
            {(interviewState === "feedback" || interviewState === "complete") && feedback && (
              <div className="mt-4 p-4 bg-gray-900/60 rounded-lg shadow-inner">
                <h3 className="text-lg font-bold text-green-400 mb-2">AI Feedback:</h3>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-300">Score:</span>
                    <span className="font-bold">
                      {feedback.score >= 8 ? (
                        <span className="text-green-400">{feedback.score}/10</span>
                      ) : feedback.score >= 5 ? (
                        <span className="text-yellow-400">{feedback.score}/10</span>
                      ) : (
                        <span className="text-red-400">{feedback.score}/10</span>
                      )}
                    </span>
                  </div>
                  <div>
                    <p className="text-gray-200">{feedback.feedback}</p>
                  </div>
                  {feedback.improvementTips && (
                    <div className="mt-3">
                      <h4 className="text-sm font-bold text-blue-300 mb-1">Improvement Tips:</h4>
                      <ul className="text-sm text-gray-300 list-disc pl-5 space-y-1">
                        {feedback.improvementTips.map((tip, index) => (
                          <li key={index}>{tip}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}