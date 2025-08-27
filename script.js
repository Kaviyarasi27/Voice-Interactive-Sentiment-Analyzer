/* Voice Sentiment Analyzer — Multi-language
   Supports: English (en), Tamil (ta), Hindi (hi)
   - SpeechRecognition (webkit/SpeechRecognition)
   - SpeechSynthesis for voice output
   - Simple lexicons + negation + intensifier handling per language
   - Frontend-only, deploy on GitHub Pages
*/

// ---------- State ----------
let historyList = [];
let chart;
let recognition = null;
let isListening = false;

// DOM
const inputEl = document.getElementById("inputText");
const resultEl = document.getElementById("result");
const confEl = document.getElementById("confidence");
const historyEl = document.getElementById("history");
const voiceBtn = document.getElementById("voiceBtn");
const analyzeBtn = document.getElementById("analyzeBtn");
const speakBtn = document.getElementById("speakBtn");
const langSelect = document.getElementById("langSelect");
const chartEl = document.getElementById("sentimentChart");

// ---------- Language resources (expandable) ----------
const resources = {
  en: {
    code: "en-US",
    lexicon: {
      "love": 3, "excellent": 3, "fantastic": 3, "amazing": 3,
      "great": 2, "good": 1, "happy": 2, "awesome": 2,
      "bad": -1, "poor": -1, "sad": -2,
      "terrible": -3, "awful": -3, "hate": -3, "horrible": -3, "worst": -3
    },
    negations: ["not", "never", "no", "hardly", "barely"],
    intensifiers: { "very": 1.6, "extremely": 2, "super": 1.5, "slightly": 0.6, "somewhat": 0.8 },
    positiveLabel: "Positive", negativeLabel: "Negative", neutralLabel: "Neutral"
  },

  ta: {
    code: "ta-IN",
    // Tamil lexicon — short examples (native script). Expand for better coverage.
    lexicon: {
      "அருமையாக": 3, "அழகான": 2, "சந்தோஷம்": 2, "நன்று": 2, "கூடுதல்": 1,
      "கேடு": -2, "கெட்டது": -2, "துன்பம்": -2, "சோகம": -2, "போடு": -1
    },
    negations: ["இல்லை", "போலவே இல்லை", "போதாத"], // basic negations
    intensifiers: { "மிக": 1.6, "அதிகமாய்": 1.8, "சிறிது": 0.6 },
    positiveLabel: "நன்னிலை", negativeLabel: "கெட்டநிலை", neutralLabel: "நியூட்ரல்"
  },

  hi: {
    code: "hi-IN",
    lexicon: {
      "प्यार": 3, "शानदार": 3, "बहुत अच्छा": 2, "अच्छा": 1, "खुश": 2,
      "बुरा": -1, "खराब": -2, "दुखी": -2, "नफ़रत": -3, "भयावह": -3
    },
    negations: ["नहीं", "कभी नहीं", "न"], 
    intensifiers: { "बहुत": 1.6, "बिलकुल": 2, "थोड़ा": 0.6 },
    positiveLabel: "सकारात्मक", negativeLabel: "नकारात्मक", neutralLabel: "तटस्थ"
  },
  te: { code: "te-IN", lexicon:{ "మంచి":2,"చెడు":-2,"ప్రేమ":3,"ద్వేషం":-3 },
        negations:["కాదు"], intensifiers:{ "చాలా":1.5 },
        positiveLabel:"సానుకూలం", negativeLabel:"ప్రతికూలం", neutralLabel:"తటస్థం" },

  ml: { code: "ml-IN", lexicon:{ "നല്ല":2,"മോശം":-2,"സ്നേഹം":3,"വെറുപ്പ്":-3 },
        negations:["ഇല്ല"], intensifiers:{ "വളരെ":1.5 },
        positiveLabel:"നല്ലത്", negativeLabel:"മോശം", neutralLabel:"നിഷ്പക്ഷം" },

  fr: { code: "fr-FR", lexicon:{ "bon":2,"mauvais":-2,"amour":3,"haine":-3 },
        negations:["ne","pas"], intensifiers:{ "très":1.5 },
        positiveLabel:"Positif", negativeLabel:"Négatif", neutralLabel:"Neutre" },

  es: { code: "es-ES", lexicon:{ "bueno":2,"malo":-2,"amor":3,"odio":-3 },
        negations:["no","nunca"], intensifiers:{ "muy":1.5 },
        positiveLabel:"Positivo", negativeLabel:"Negativo", neutralLabel:"Neutral" },

  de: { code: "de-DE", lexicon:{ "gut":2,"schlecht":-2,"liebe":3,"hass":-3 },
        negations:["nicht","nie"], intensifiers:{ "sehr":1.5 },
        positiveLabel:"Positiv", negativeLabel:"Negativ", neutralLabel:"Neutral" },

  ar: { code: "ar-SA", lexicon:{ "جيد":2,"سيء":-2,"حب":3,"كراهية":-3 },
        negations:["لا","أبدا"], intensifiers:{ "جداً":1.5 },
        positiveLabel:"إيجابي", negativeLabel:"سلبي", neutralLabel:"محايد" }
};

// Helper to get current language resource
function getRes() {
  const lang = langSelect.value || "en";
  return resources[lang] || resources.en;
}

// ---------- Speech Recognition setup ----------
function createRecognition() {
  // Cleanup previous
  if (recognition) {
    try { recognition.onresult = null; recognition.onerror = null; recognition.onend = null; } catch(e){}
    recognition = null;
  }

  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRec) {
    // no support
    recognition = null;
    return;
  }

  recognition = new SpeechRec();
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = getRes().code;

  recognition.onresult = (event) => {
    const transcript = Array.from(event.results)
      .map(r => r[0].transcript)
      .join(" ");
    inputEl.value = transcript;
    analyzeSentiment(true);
  };

  recognition.onerror = (e) => {
    console.warn("Speech recognition error:", e);
    stopListeningUI();
  };

  recognition.onend = () => {
    // ensure UI toggle reset
    if (isListening) stopListeningUI();
  };
}

// Start/stop listening
function toggleVoice() {
  if (!recognition) {
    alert("❌ Voice recognition unsupported in this browser. Use Chrome/Edge.");
    return;
  }

  if (isListening) {
    recognition.stop();
    stopListeningUI();
  } else {
    recognition.lang = getRes().code; // ensure latest
    try {
      recognition.start();
      startListeningUI();
    } catch (err) {
      console.warn("Could not start recognition:", err);
    }
  }
}
function startListeningUI() {
  isListening = true;
  voiceBtn.textContent = "🛑";
  voiceBtn.classList.remove("bg-red-500");
  voiceBtn.classList.add("bg-green-600");
}
function stopListeningUI() {
  isListening = false;
  voiceBtn.textContent = "🎙️";
  voiceBtn.classList.remove("bg-green-600");
  voiceBtn.classList.add("bg-red-500");
}

// ---------- Natural Sentiment Analyzer (multi-language) ----------
function analyzeSentiment(shouldSpeak = false) {
  const rawText = inputEl.value.trim();
  if (!rawText) {
    resultEl.textContent = getEmptyMessage();
    resultEl.style.color = "black";
    confEl.textContent = "";
    return;
  }

  const res = getRes();
  // simple sentence split (works for most languages)
  const sentences = rawText.split(/[.!?।]+/).filter(Boolean);
  let totalScore = 0;
  let totalWords = 0;

  const lex = res.lexicon;
  const negations = res.negations || [];
  const ints = res.intensifiers || {};

  sentences.forEach(sentence => {
    const words = sentence.trim().split(/\s+/);
    let sentenceScore = 0;
    let negate = false;
    let intensity = 1;

    words.forEach(rawWord => {
      const word = rawWord.replace(/[^\p{L}\p{N}]+/gu, "").toLowerCase();
      if (!word) return;

      // negation check (exact match or startsWith common)
      if (negations.includes(word)) {
        negate = true;
        return;
      }

      // intensifier
      if (ints[word]) {
        intensity = ints[word];
        return;
      }

      // lexicon hit
      if (lex[word] !== undefined) {
        let score = lex[word];
        if (negate) {
          score = -score;
          negate = false; // only flip nearest sentiment
        }
        sentenceScore += score * intensity;
        intensity = 1;
      }

      totalWords++;
    });

    totalScore += sentenceScore;
  });

  // Decide sentiment
  let sentimentLabel = res.neutralLabel || "Neutral";
  let color = "gray";
  let confidence = 50;

  // thresholds tuned for multi-lingual small lexicons
  if (totalScore > 1) {
    sentimentLabel = res.positiveLabel;
    color = "green";
    confidence = Math.min(100, 60 + (totalScore / Math.max(1, totalWords)) * 40);
  } else if (totalScore < -1) {
    sentimentLabel = res.negativeLabel;
    color = "red";
    confidence = Math.min(100, 60 + (Math.abs(totalScore) / Math.max(1, totalWords)) * 40);
  }

  // Show
  resultEl.textContent = `${emojiFor(sentimentLabel)} ${sentimentLabel}`;
  resultEl.style.color = color;
  confEl.textContent = `Confidence: ${confidence.toFixed(1)}%`;

  // Save to history (keep last 6)
  historyList.unshift({ text: rawText, label: sentimentLabel, conf: confidence.toFixed(1) });
  if (historyList.length > 6) historyList.pop();
  renderHistory();

  // Chart: convert totalScore to positive/negative/neutral buckets
  const pos = Math.max(0, totalScore);
  const neg = Math.max(0, -totalScore);
  const neutral = Math.max(0, sentences.length - (pos + neg));
  updateChart(pos, neg, neutral);

  // Speak result if requested
  if (shouldSpeak) {
    const spokenLang = getRes().code;
    const plainLabel = sentimentLabel.toString();
    const msg = speakTextForLanguage(plainLabel, confidence, langSelect.value);
    speak(msg, spokenLang);
  }
}

function renderHistory() {
  historyEl.innerHTML = historyList.map(item =>
    `<li><b>${item.label}</b> (${item.conf}%) → ${escapeHtml(item.text).slice(0, 60)}${item.text.length>60 ? "..." : ""}</li>`
  ).join("");
}

function getEmptyMessage() {
  const lang = langSelect.value;
  if (lang === "ta") return "⚠️ தயவுசெய்து உரையை அளிக்கவும்!";
  if (lang === "hi") return "⚠️ कृपया कुछ लिखें या बोलें!";
  return "⚠️ Please enter or speak some text!";
}

// ---------- Text-to-speech ----------
function speak(message, langCode = "en-US") {
  if (!("speechSynthesis" in window)) {
    console.warn("No speechSynthesis support");
    return;
  }
  // cancel any existing
  window.speechSynthesis.cancel();

  const utt = new SpeechSynthesisUtterance(message);
  // language like "en-US", "ta-IN", "hi-IN"
  utt.lang = langCode;
  utt.rate = 1;
  utt.pitch = 1;
  window.speechSynthesis.speak(utt);
}

// Build spoken message per language code short (keeps it natural)
function speakTextForLanguage(label, confidence, shortLang) {
  const cRound = Math.round(confidence);
  if (shortLang === "ta") {
    return `${label} என்று நினைக்கிறேன் ${cRound} சதவீத நம்பிக்கையோடு.`;
  }
  if (shortLang === "hi") {
    return `मुझे लगता है यह ${label} है, लगभग ${cRound} प्रतिशत आत्मविश्वास के साथ।`;
  }
  // default english
  return `I think this is ${label} with ${cRound} percent confidence.`;
}

// ---------- Chart update ----------
function updateChart(pos, neg, neutral) {
  const ctx = chartEl.getContext("2d");
  if (chart) chart.destroy();
  chart = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: ["Positive", "Negative", "Neutral"],
      datasets: [{
        data: [pos, neg, neutral],
        backgroundColor: ["#16a34a", "#dc2626", "#9ca3af"]
      }]
    },
    options: { responsive: true, plugins: { legend: { position: "bottom" } } }
  });
}

// ---------- Utilities ----------
function emojiFor(label) {
  const s = label.toString().toLowerCase();
  if (/(positive|சந்தோ|பய)/i.test(s) || s.includes("நன்னிலை") || s.includes("سकारात्मक") || s.includes("सकारात्मक")) return "😊";
  if (/(negative|கெட்ட|बुरा)/i.test(s) || s.includes("கெட்டநிலை") || s.includes("नकारात्मक")) return "😞";
  return "😐";
}
function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (m) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

// ---------- UI wiring ----------
analyzeBtn.addEventListener("click", () => analyzeSentiment(false));
voiceBtn.addEventListener("click", toggleVoice);
speakBtn.addEventListener("click", () => {
  // speak latest result
  if (!historyList.length) {
    const msg = langSelect.value === "ta" ? "முன்னதாக ஒரு உரையை விவாதிக்கவும்." : (langSelect.value === "hi" ? "पहले कुछ बोलें या लिखें।" : "Please enter or speak some text first.");
    speak(msg, getRes().code);
    return;
  }
  const latest = historyList[0];
  const msg = speakTextForLanguage(latest.label, latest.conf, langSelect.value);
  speak(msg, getRes().code);
});

// Recreate recognition when language changes
langSelect.addEventListener("change", () => {
  // stop if listening
  if (isListening && recognition) {
    recognition.stop();
    stopListeningUI();
  }
  createRecognition();
  // update placeholder & buttons text lightly
  if (langSelect.value === "ta") {
    inputEl.placeholder = "உரையை உள்ளிடவும் அல்லது பேசுங்கள்...";
  } else if (langSelect.value === "hi") {
    inputEl.placeholder = "किसी टेक्स्ट को टाइप करें या बोलें...";
  } else {
    inputEl.placeholder = "Type or speak your text here...";
  }
});

// init
(function init() {
  createRecognition();
  // default empty chart
  updateChart(0,0,1);
})();
