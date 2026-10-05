import { useState, useEffect, useCallback, useRef } from "react";
import { generateTest, submitAnswers } from "../services/api";

const MockTest = ({ params, onComplete }) => {
  const [questions, setQuestions] = useState([]);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [timeLeft, setTimeLeft] = useState(params.timeLimit * 60);
  const [timerActive, setTimerActive] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const submitLock = useRef(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const fetchQuestions = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await generateTest(params);
        if (cancelled) return;
        if (response?.questions?.length) {
          setQuestions(response.questions);
          setAnswers(
            Object.fromEntries(response.questions.map((q) => [q.id, ""]))
          );
          setTimerActive(true);
        } else {
          throw new Error("Invalid response format from server");
        }
      } catch (err) {
        if (!cancelled) setError(err.message || "Failed to generate questions. Please try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchQuestions();
    return () => { cancelled = true; };
  }, [params, reload]);

  const handleAnswerSelect = (questionId, answer) => {
    setAnswers((prev) => ({ ...prev, [questionId]: answer }));
  };

  const handleSubmit = useCallback(async () => {
    if (submitLock.current) return;
    submitLock.current = true;
    setError(null);
    setSubmitting(true);
    setTimerActive(false);
    try {
      const result = await submitAnswers({
        testParams: params,
        questions,
        answers,
      });
      if (result) onComplete(result);
      else throw new Error("No result returned from server");
    } catch (err) {
      setError(err.message || "Failed to submit answers. Please try again.");
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  }, [params, questions, answers, onComplete]);

  useEffect(() => {
    let timer;
    if (timerActive && timeLeft > 0) {
      timer = setInterval(() => setTimeLeft((prev) => prev - 1), 1000);
    } else if (timeLeft === 0 && timerActive) {
      handleSubmit();
    }
    return () => clearInterval(timer);
  }, [timeLeft, timerActive, handleSubmit]);

  const formatTime = (seconds) =>
    `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;


  if (loading)
    return (
      <div className="p-6 text-center">
        Loading test...{" "}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-16 h-16 border-4 border-blue-400 border-t-transparent rounded-full animate-spin shadow-lg shadow-blue-400/20"></div>
        </div>
      </div>
    );
  if (error && !questions.length) return <div className="p-6 text-center"><p role="alert" className="text-red-400">{error}</p><button className="mt-4 px-4 py-2 rounded bg-blue-600 text-white" onClick={() => setReload((value) => value + 1)}>Try again</button></div>;
  if (!questions.length)
    return <div className="p-6 text-center">No questions available.</div>;

  const question = questions[currentQuestion];

  return (
    <div className="bg-gray-800 p-6 rounded-lg shadow-lg w-full max-w-2xl mx-auto">
      {error && <div role="alert" className="mb-4 p-3 bg-red-950 text-red-200 rounded"><p>{error}</p><button className="underline mt-2" disabled={submitting} onClick={handleSubmit}>Retry submission</button></div>}
      <div className="flex justify-between text-gray-300 mb-4">
        <span>
          Question {currentQuestion + 1} of {questions.length}
        </span>
        <span>Time Left: {formatTime(timeLeft)}</span>
      </div>

      <h3 className="text-lg font-semibold text-white mb-4">
        {question.question}
      </h3>

      {question.options?.length ? (
        <div className="space-y-3">
          {question.options.map((opt, idx) => (
            <button
              type="button"
              aria-pressed={answers[question.id] === opt}
              disabled={submitting || timeLeft === 0}
              key={idx}
              className={`w-full text-left p-3 rounded-md cursor-pointer transition-colors border ${
                answers[question.id] === opt
                  ? "bg-blue-600 border-blue-400"
                  : "bg-gray-700 border-gray-600 hover:bg-gray-600"
              }`}
              onClick={() => handleAnswerSelect(question.id, opt)}
            >
              <div className="flex items-center">
                <div
                  className={`w-5 h-5 rounded-full mr-3 flex items-center justify-center ${
                    answers[question.id] === opt
                      ? "bg-white border-white"
                      : "bg-gray-800 border-gray-400"
                  } border`}
                >
                  {answers[question.id] === opt && (
                    <div className="w-2 h-2 rounded-full bg-blue-600"></div>
                  )}
                </div>
                <span className="text-white">{opt}</span>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <textarea
          className="w-full bg-gray-700 p-3 rounded-md text-white border border-gray-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          placeholder="Type your answer..."
          aria-label="Your answer"
          disabled={submitting || timeLeft === 0}
          rows={4}
          value={answers[question.id]}
          onChange={(e) => handleAnswerSelect(question.id, e.target.value)}
        />
      )}

      <div className="flex justify-between mt-6">
        <button
          className={`px-4 py-2 rounded-md ${
            currentQuestion === 0
              ? "bg-gray-700 text-gray-400 cursor-not-allowed"
              : "bg-gray-600 text-white hover:bg-gray-500"
          }`}
          disabled={currentQuestion === 0}
          onClick={() => setCurrentQuestion((prev) => prev - 1)}
        >
          Previous
        </button>
        {currentQuestion < questions.length - 1 ? (
          <button
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-500"
            onClick={() => setCurrentQuestion((prev) => prev + 1)}
          >
            Next
          </button>
        ) : (
          <button
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-500 flex items-center justify-center"
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? (
              <>
                <svg
                  className="w-5 h-5 mr-2 animate-spin text-white"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <circle
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    className="opacity-25"
                  />
                  <path
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8v8H4z"
                    className="opacity-75"
                  />
                </svg>
                Submitting...
              </>
            ) : (
              "Submit Test"
            )}
          </button>
        )}
      </div>
    </div>
  );
};

export default MockTest;
