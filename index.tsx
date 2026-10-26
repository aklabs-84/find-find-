
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { loadVision, checkTarget } from './vision';

// 테마별 아이템 리스트
const THEMES = {
  HOME: {
    label: '우리 집 거실',
    icon: '🏠',
    items: [
      { emoji: '📱', name: '스마트폰', en: 'Smartphone', keyword: 'smartphone' },
      { emoji: '☕', name: '컵', en: 'Cup', keyword: 'cup or mug' },
      { emoji: '👓', name: '안경', en: 'Glasses', keyword: 'glasses' },
      { emoji: '📖', name: '책', en: 'Book', keyword: 'book' },
      { emoji: '🛋️', name: '소파', en: 'Sofa', keyword: 'sofa or couch' },
      { emoji: '📺', name: 'TV', en: 'Television', keyword: 'television' },
    ]
  },
  OFFICE: {
    label: '사무실/공부방',
    icon: '💻',
    items: [
      { emoji: '⌨️', name: '키보드', en: 'Keyboard', keyword: 'computer keyword' },
      { emoji: '🖱️', name: '마우스', en: 'Mouse', keyword: 'computer mouse' },
      { emoji: '🖊️', name: '펜', en: 'Pen', keyword: 'pen or pencil' },
      { emoji: '⌚', name: '손목시계', en: 'Watch', keyword: 'wrist watch' },
      { emoji: '💻', name: '노트북', en: 'Laptop', keyword: 'laptop computer' },
      { emoji: '📁', name: '폴더', en: 'Folder', keyword: 'file folder' },
    ]
  },
  FOOD: {
    label: '맛있는 주방',
    icon: '🍎',
    items: [
      { emoji: '🍎', name: '사과', en: 'Apple', keyword: 'apple fruit' },
      { emoji: '🥤', name: '텀블러', en: 'Tumbler', keyword: 'water bottle or tumbler' },
      { emoji: '🍌', name: '바나나', en: 'Banana', keyword: 'banana' },
      { emoji: '🍴', name: '포크', en: 'Fork', keyword: 'fork' },
      { emoji: '🍳', name: '프라이팬', en: 'Pan', keyword: 'frying pan' },
      { emoji: '🥣', name: '그릇', en: 'Bowl', keyword: 'bowl' },
    ]
  }
};

const INITIAL_TIME = 25;
const BONUS_TIME = 10;
const COMBO_WINDOW = 8000;

const App = () => {
  const [gameState, setGameState] = useState<'START' | 'HOW_TO' | 'THEME_SELECT' | 'PLAYING' | 'FOUND' | 'RESULTS'>('START');
  const [isNoticeOpen, setIsNoticeOpen] = useState(true); // 시작 주의사항 팝업 상태
  const [isLearningMode, setIsLearningMode] = useState(true); 
  const [selectedTheme, setSelectedTheme] = useState<keyof typeof THEMES>('HOME');
  const [currentItemIndex, setCurrentItemIndex] = useState(0);
  const [usedIndices, setUsedIndices] = useState<number[]>([]); 
  const [timeLeft, setTimeLeft] = useState(INITIAL_TIME);
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [lastFoundTime, setLastFoundTime] = useState(0);
  const [isFever, setIsFever] = useState(false);
  const [aiHint, setAiHint] = useState<string | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cameraFacing, setCameraFacing] = useState<'environment' | 'user'>('environment');

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const timerRef = useRef<number | null>(null);
  const analysisIntervalRef = useRef<number | null>(null);

  const currentItem = THEMES[selectedTheme].items[currentItemIndex];

  useEffect(() => {
    const saved = localStorage.getItem('emoji-hunt-high-score');
    if (saved) setHighScore(parseInt(saved, 10));
  }, []);

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
  };

  const startCamera = async (facing: 'environment' | 'user' = cameraFacing) => {
    stopCamera();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch (err) {
      setError('카메라 권한이 필요합니다.');
    }
  };

  const switchCamera = () => {
    const next = cameraFacing === 'environment' ? 'user' : 'environment';
    setCameraFacing(next);
    startCamera(next);
  };

  const goToHome = () => {
    stopCamera();
    setGameState('START');
    setScore(0);
    setCombo(0);
    setIsFever(false);
  };

  const startGame = (themeKey: keyof typeof THEMES) => {
    setSelectedTheme(themeKey);
    setGameState('PLAYING');
    
    const firstIdx = Math.floor(Math.random() * THEMES[themeKey].items.length);
    setCurrentItemIndex(firstIdx);
    setUsedIndices([firstIdx]);
    
    setTimeLeft(INITIAL_TIME);
    setScore(0);
    setCombo(0);
    setIsFever(false);
    setHistory([]);
    setAiHint(null);
    startCamera(cameraFacing);
    loadVision().catch(() => setError('AI 모델을 불러오지 못했어요. 새로고침 해주세요.'));
  };

  const nextItem = () => {
    const items = THEMES[selectedTheme].items;
    const availableIndices = items
      .map((_, idx) => idx)
      .filter(idx => !usedIndices.includes(idx));

    let nextIdx;
    if (availableIndices.length === 0) {
      nextIdx = Math.floor(Math.random() * items.length);
      setUsedIndices([nextIdx]);
    } else {
      const randomIndex = Math.floor(Math.random() * availableIndices.length);
      nextIdx = availableIndices[randomIndex];
      setUsedIndices(prev => [...prev, nextIdx]);
    }
    
    setCurrentItemIndex(nextIdx);
    setAiHint(null);
    setGameState('PLAYING');
  };

  const speakItem = (name: string, en: string) => {
    const msg = new SpeechSynthesisUtterance(`${name}! 영어로는 ${en}입니다!`);
    msg.lang = 'ko-KR';
    window.speechSynthesis.speak(msg);
  };

  const analyzeFrame = useCallback(async () => {
    if (gameState !== 'PLAYING' || isAnalyzing || !videoRef.current) return;

    const video = videoRef.current;
    if (video.videoWidth === 0) return;

    setIsAnalyzing(true);
    try {
      const result = checkTarget(video, currentItem.en);
      if (result === 'YES') {
        handleItemFound();
      } else if (result === 'HINT') {
        setAiHint('거의 다 왔어요! 가운데에 크게 보이게 비춰 보세요.');
      } else {
        setAiHint(null);
      }
    } catch (err) { console.error(err); }
    setTimeout(() => setIsAnalyzing(false), 100);
  }, [gameState, isAnalyzing, currentItem]);

  const handleItemFound = () => {
    const now = Date.now();
    const isCombo = (now - lastFoundTime) < COMBO_WINDOW && lastFoundTime !== 0;
    const newCombo = isCombo ? combo + 1 : 0;
    
    setGameState('FOUND');
    setCombo(newCombo);
    setIsFever(newCombo >= 2);
    setLastFoundTime(now);
    
    const points = (newCombo >= 2) ? 2 : 1;
    const newScore = score + points;
    setScore(newScore);
    setTimeLeft(t => t + BONUS_TIME);
    setHistory(prev => [...prev, { ...currentItem, time: new Date().toLocaleTimeString() }]);

    if (newScore > highScore) {
      setHighScore(newScore);
      localStorage.setItem('emoji-hunt-high-score', newScore.toString());
    }

    if (isLearningMode) {
      speakItem(currentItem.name, currentItem.en);
    }
  };

  useEffect(() => {
    if (gameState === 'PLAYING') {
      timerRef.current = window.setInterval(() => {
        setTimeLeft(t => {
          if (t <= 1) {
            setGameState('RESULTS');
            return 0;
          }
          return t - 1;
        });
      }, 1000);
      analysisIntervalRef.current = window.setInterval(() => analyzeFrame(), 1800);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      if (analysisIntervalRef.current) clearInterval(analysisIntervalRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (analysisIntervalRef.current) clearInterval(analysisIntervalRef.current);
    };
  }, [gameState, analyzeFrame]);

  const HomeButton = ({ absolute = true, light = false }) => (
    <button 
      onClick={goToHome}
      className={`${absolute ? 'absolute top-6 left-6' : ''} z-[100] w-12 h-12 flex items-center justify-center rounded-2xl ${light ? 'bg-white/20 text-white backdrop-blur-md' : 'bg-gray-100 text-gray-600'} hover:bg-opacity-40 transition-all pointer-events-auto active:scale-90`}
      aria-label="홈으로 이동"
    >
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
        <polyline points="9 22 9 12 15 12 15 22"/>
      </svg>
    </button>
  );

  const AklabsFooter = () => (
    <a 
      href="https://litt.ly/aklabs" 
      target="_blank" 
      rel="noopener noreferrer"
      className="mt-4 mb-8 group w-full max-w-[340px] bg-white rounded-2xl p-4 flex items-center justify-between shadow-lg hover:shadow-xl transition-all active:scale-95 flex-shrink-0"
    >
      <div className="flex flex-col text-left">
        <span className="text-[14px] font-bold text-gray-800 leading-tight">나만의 AI 웹앱을 만들고 싶다면?</span>
        <span className="text-[12px] font-medium text-blue-600 mt-0.5">아크랩스에서 AI 마스터가 되어보세요</span>
      </div>
      <div className="w-9 h-9 bg-[#111317] rounded-xl flex items-center justify-center transition-transform group-hover:translate-x-1">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 18l6-6-6-6"/>
        </svg>
      </div>
    </a>
  );

  const NoticeModal = () => (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-white rounded-[40px] shadow-2xl max-w-lg w-full p-8 md:p-12 overflow-hidden relative border-t-[12px] border-orange-400 max-h-[90vh] overflow-y-auto custom-scrollbar">
        <div className="text-5xl mb-6">⚠️</div>
        <h2 className="text-2xl md:text-3xl font-black text-gray-900 mb-6 leading-tight">시작 전 꼭 읽어주세요!</h2>
        
        <div className="space-y-5 mb-10 text-left">
          <div className="flex items-start bg-orange-50 p-4 rounded-2xl">
            <span className="text-xl mr-3">☀️</span>
            <p className="text-sm md:text-base font-bold text-orange-800 leading-relaxed">
              <strong>밝은 곳에서 플레이:</strong> 어두운 곳에서는 AI가 사물을 인식하기 어렵습니다. 조명이 밝은 곳에서 비춰주세요.
            </p>
          </div>
          <div className="flex items-start bg-blue-50 p-4 rounded-2xl">
            <span className="text-xl mr-3">🎯</span>
            <p className="text-sm md:text-base font-bold text-blue-800 leading-relaxed">
              <strong>중앙 가이드에 맞추기:</strong> 찾으려는 물건을 화면 정중앙의 점선 박스 안에 가득 차게 비춰주세요.
            </p>
          </div>
          <div className="flex items-start bg-gray-50 p-4 rounded-2xl">
            <span className="text-xl mr-3">📡</span>
            <p className="text-sm md:text-base font-bold text-gray-700 leading-relaxed">
              <strong>처음 시작할 때 잠깐만:</strong> AI 도감을 불러오는 데 몇 초 걸려요. 그 뒤로는 내 기기 안에서 바로 찾아요!
            </p>
          </div>
        </div>

        <button
          onClick={() => setIsNoticeOpen(false)}
          className="w-full bg-gray-900 hover:bg-black text-white font-black py-5 rounded-3xl text-lg shadow-xl transition-all active:scale-95"
        >
          네, 확인했습니다!
        </button>
      </div>
    </div>
  );

  return (
    <div className={`fixed inset-0 font-sans overflow-y-auto flex flex-col items-center text-gray-900 transition-colors duration-500 custom-scrollbar ${isFever ? 'bg-orange-500' : 'bg-[#ffca28]'}`}>
      <style>{`
        @keyframes fever-pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.05); } }
        .fever-active { animation: fever-pulse 0.5s infinite; }
        .scan-line { height: 6px; background: #3b82f6; box-shadow: 0 0 20px #3b82f6; position: absolute; width: 100%; animation: scan 2s linear infinite; }
        @keyframes scan { 0% { top: 0; opacity: 0; } 10% { opacity: 1; } 90% { opacity: 1; } 100% { top: 100%; opacity: 0; } }
        .combo-badge { position: absolute; right: -20px; top: -20px; background: #ef4444; color: white; padding: 5px 15px; border-radius: 20px; font-weight: 900; box-shadow: 0 4px 10px rgba(0,0,0,0.2); z-index: 50; }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
      `}</style>

      {/* 중요 주의사항 팝업 */}
      {isNoticeOpen && <NoticeModal />}

      {/* 시작 화면 */}
      {gameState === 'START' && (
        <div className="z-10 flex flex-col items-center animate-in fade-in zoom-in duration-500 px-6 w-full py-6 md:py-10 min-h-screen justify-center">
          <div className="text-center p-6 md:p-10 bg-white/95 backdrop-blur-lg rounded-[50px] shadow-2xl max-w-xl w-full border-b-[10px] border-gray-200">
            <div className="text-7xl md:text-8xl mb-4 md:mb-6 animate-bounce">🔍</div>
            <h1 className="text-3xl md:text-5xl font-black mb-2 text-gray-900 leading-tight">이모지 보물찾기</h1>
            <p className="text-gray-400 font-bold mb-4 md:mb-8 uppercase tracking-widest text-xs md:text-sm">AI Scavenger Hunt 2.0</p>
            
            <div className="mb-6 p-3 md:p-4 bg-orange-50 rounded-3xl border border-orange-100 text-left max-w-sm mx-auto">
              <div className="flex items-center text-orange-600 font-black text-[10px] md:text-xs uppercase tracking-tighter mb-1">
                <span className="mr-1">💡</span> 쾌적한 플레이를 위한 팁
              </div>
              <p className="text-[10px] md:text-[11px] text-orange-700 leading-tight font-medium">
                • 주변을 <strong>밝게</strong> 해주세요.<br/>
                • 물건을 화면 <strong>중앙</strong>에 크게 맞춰주세요.<br/>
                • AI 인식이 완벽하지 않을 수 있으니 여유를 가져주세요!
              </p>
            </div>

            <div className="space-y-3 md:space-y-4 max-w-sm mx-auto">
              <button 
                onClick={() => setIsLearningMode(!isLearningMode)}
                className={`w-full flex items-center justify-between p-4 rounded-3xl border-2 transition-all ${isLearningMode ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-transparent'}`}
              >
                <div className="text-left">
                  <div className="font-black text-xs md:text-sm text-gray-800">다국어 학습 모드</div>
                  <div className="text-[9px] md:text-[10px] text-gray-400 font-bold uppercase">보물 발견 시 발음 안내</div>
                </div>
                <div className={`w-10 h-5 md:w-12 md:h-6 rounded-full relative transition-colors ${isLearningMode ? 'bg-blue-500' : 'bg-gray-300'}`}>
                  <div className={`absolute top-0.5 md:top-1 w-4 h-4 bg-white rounded-full transition-all ${isLearningMode ? 'right-0.5 md:right-1' : 'left-0.5 md:left-1'}`} />
                </div>
              </button>

              <button
                onClick={() => setGameState('THEME_SELECT')}
                className="w-full bg-[#ffca28] hover:bg-[#ffb300] text-gray-900 font-black py-4 md:py-5 rounded-3xl text-lg md:text-xl shadow-[0_6px_0_rgb(217,163,0)] transition-all active:translate-y-1 active:shadow-none"
              >
                게임 시작하기!
              </button>
              <button
                onClick={() => setGameState('HOW_TO')}
                className="w-full bg-white border-2 border-gray-100 hover:bg-gray-50 text-gray-600 font-bold py-2 md:py-3 rounded-3xl text-xs transition-all"
              >
                상세 사용 방법 보기 💡
              </button>
            </div>
          </div>
          <AklabsFooter />
        </div>
      )}

      {/* 사용 방법 화면 */}
      {gameState === 'HOW_TO' && (
        <div className="z-10 w-[95%] max-w-lg p-8 md:p-12 bg-white/98 backdrop-blur-xl rounded-[50px] shadow-2xl animate-in slide-in-from-bottom-10 flex flex-col max-h-[90vh] my-12 relative">
          <div className="mb-6 flex justify-between items-start mt-0">
            <div>
              <h2 className="text-2xl font-black text-gray-900">사용 방법 & 특징</h2>
              <p className="text-blue-600 font-bold text-sm mt-1 italic">"주변의 사물을 비춰 AI와 함께 이모지를 찾는 AR 보물찾기!"</p>
            </div>
            <button onClick={() => setGameState('START')} className="text-gray-300 hover:text-gray-600 text-3xl font-black block">×</button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-6 pr-2 custom-scrollbar">
            <div className="space-y-4">
              <div className="flex items-start">
                <div className="bg-orange-100 text-orange-600 w-8 h-8 rounded-full flex items-center justify-center font-black flex-shrink-0 mr-4">1</div>
                <p className="text-gray-600 font-medium leading-relaxed"><strong>테마 선택:</strong> 거실, 사무실, 주방 등 원하는 장소 테마를 선택해 게임을 시작하세요.</p>
              </div>
              <div className="flex items-start">
                <div className="bg-orange-100 text-orange-600 w-8 h-8 rounded-full flex items-center justify-center font-black flex-shrink-0 mr-4">2</div>
                <p className="text-gray-600 font-medium leading-relaxed"><strong>사물 찾기:</strong> 화면에 표시된 이모지와 실제 사물을 카메라 중앙 가이드에 맞춰 비춰주세요.</p>
              </div>
              <div className="flex items-start">
                <div className="bg-orange-100 text-orange-600 w-8 h-8 rounded-full flex items-center justify-center font-black flex-shrink-0 mr-4">3</div>
                <p className="text-gray-600 font-medium leading-relaxed"><strong>실시간 AI 판독:</strong> 내 기기 안의 AI(MediaPipe)가 여러분이 비춘 사물을 바로 분석하여 정답 여부를 알려줍니다.</p>
              </div>
              <div className="flex items-start">
                <div className="bg-orange-100 text-orange-600 w-8 h-8 rounded-full flex items-center justify-center font-black flex-shrink-0 mr-4">4</div>
                <p className="text-gray-600 font-medium leading-relaxed"><strong>콤보 & 피버 모드:</strong> 빠르게 연속으로 사물을 찾으면 점수가 2배가 되는 피버 모드가 활성화됩니다!</p>
              </div>
              <div className="flex items-start">
                <div className="bg-orange-100 text-orange-600 w-8 h-8 rounded-full flex items-center justify-center font-black flex-shrink-0 mr-4">5</div>
                <p className="text-gray-600 font-medium leading-relaxed"><strong>인식 주의:</strong> 너무 어둡거나 물건이 작게 보이면 인식이 잘 안 될 수 있으니 밝은 곳에서 중앙에 맞춰주세요.</p>
              </div>
            </div>
          </div>

          <button
            onClick={() => setGameState('THEME_SELECT')}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-5 rounded-3xl text-lg mt-8 shadow-[0_8px_0_rgb(30,58,138)] transition-all active:translate-y-1 active:shadow-none"
          >
            알겠어요, 게임 시작!
          </button>
        </div>
      )}

      {/* 테마 선택 화면 */}
      {gameState === 'THEME_SELECT' && (
        <div className="z-10 w-[90%] max-w-md p-8 bg-white/95 rounded-[50px] shadow-2xl animate-in slide-in-from-bottom-10 relative my-12">
          <HomeButton />
          <h2 className="text-2xl font-black mb-6 text-center mt-16 md:mt-0">미션 테마를 선택하세요</h2>
          <div className="grid gap-4">
            {(Object.keys(THEMES) as Array<keyof typeof THEMES>).map(key => (
              <button
                key={key}
                onClick={() => startGame(key)}
                className="flex items-center p-5 bg-gray-50 rounded-3xl border-2 border-transparent hover:border-[#ffca28] transition-all group"
              >
                <div className="text-4xl mr-4 group-hover:scale-125 transition-transform">{THEMES[key].icon}</div>
                <div className="text-left">
                  <div className="font-black text-xl">{THEMES[key].label}</div>
                  <div className="text-xs text-gray-400 font-bold uppercase tracking-tight">{THEMES[key].items.length} Items</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 게임 플레이 화면 (카메라 뷰는 fixed) */}
      {(gameState === 'PLAYING' || gameState === 'FOUND') && (
        <div className="fixed inset-0 z-0">
          <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover" />
          
          <HomeButton light={true} />

          <button
            onClick={switchCamera}
            className="absolute top-6 right-6 z-[100] w-12 h-12 flex items-center justify-center rounded-2xl bg-white/20 text-white backdrop-blur-md hover:bg-opacity-40 transition-all pointer-events-auto active:scale-90"
            aria-label="카메라 앞뒤 전환"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 0 1 15-6.7L21 8"/>
              <polyline points="21 3 21 8 16 8"/>
              <path d="M21 12a9 9 0 0 1-15 6.7L3 16"/>
              <polyline points="3 21 3 16 8 16"/>
            </svg>
          </button>

          <div className="absolute inset-0 border-[clamp(20px,5vw,40px)] border-black/30 pointer-events-none flex items-center justify-center">
            <div className={`relative w-[min(80vw,400px)] h-[min(80vw,400px)] border-4 border-dashed border-white/80 rounded-[40px] transition-all ${isFever ? 'fever-active border-orange-400 shadow-[0_0_50px_rgba(251,146,60,0.5)]' : ''}`}>
              {isAnalyzing && <div className="scan-line" />}
            </div>
          </div>

          <div className="z-10 flex flex-col items-center w-full h-full justify-between py-10 pointer-events-none px-6">
            <div className="bg-white/95 backdrop-blur-xl px-10 py-4 rounded-[30px] shadow-2xl flex items-center space-x-8 border-b-4 border-gray-200 w-full max-sm:px-6">
              <div className="flex-1 text-center">
                <div className="text-[10px] font-black uppercase text-gray-400">Time</div>
                <div className={`text-2xl sm:text-3xl font-black ${timeLeft <= 5 ? 'text-red-500 animate-pulse' : ''}`}>{timeLeft}s</div>
              </div>
              <div className="w-px h-10 bg-gray-200" />
              <div className="flex-1 text-center">
                <div className="text-[10px] font-black uppercase text-gray-400">Score</div>
                <div className="text-2xl sm:text-3xl font-black text-blue-600">{score}</div>
              </div>
            </div>

            <div className="flex flex-col items-center relative pointer-events-auto">
              {combo > 0 && <div className="combo-badge animate-bounce">{combo} COMBO!</div>}
              <div 
                onClick={() => speakItem(currentItem.emoji, currentItem.en)}
                className="text-[clamp(100px,25vw,160px)] filter drop-shadow-2xl mb-2 cursor-pointer hover:scale-110 transition-transform active:scale-95"
              >
                {currentItem.emoji}
              </div>
              <div 
                onClick={() => speakItem(currentItem.name, currentItem.en)}
                className="bg-white px-8 sm:px-10 py-3 rounded-2xl shadow-2xl border-b-8 border-gray-200 text-center cursor-pointer hover:bg-gray-50 active:translate-y-1 active:border-b-4 transition-all"
              >
                <div className="text-2xl sm:text-3xl font-black">{currentItem.name}</div>
                <div className="text-blue-500 font-black text-xs sm:text-sm italic uppercase tracking-widest">{currentItem.en}</div>
                <div className="text-[10px] text-gray-300 font-bold mt-1">발음 다시 듣기 🔊</div>
              </div>
            </div>

            <div className="min-h-[60px] flex items-center">
              {aiHint && (
                <div className="bg-blue-600/90 text-white px-8 py-3 rounded-full text-sm font-bold shadow-2xl animate-in slide-in-from-bottom-5">
                  💡 {aiHint}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 발견 성공 (fixed) */}
      {gameState === 'FOUND' && (
        <div className={`z-20 fixed inset-0 flex flex-col items-center justify-center animate-in fade-in ${isFever ? 'bg-orange-500/90' : 'bg-blue-500/90'} p-6`}>
          <div className="text-9xl animate-ping mb-8">🎯</div>
          <h2 className="text-white text-5xl sm:text-6xl font-black italic tracking-tighter mb-4 text-center">{isFever ? 'FEVER! x2' : '보물 발견!'}</h2>
          
          <div 
            onClick={() => speakItem(currentItem.name, currentItem.en)}
            className="bg-white/95 backdrop-blur-md p-8 rounded-[40px] shadow-2xl text-center mb-8 max-w-xs w-full cursor-pointer hover:scale-105 active:scale-95 transition-transform"
          >
             <div className="text-7xl mb-4">{currentItem.emoji}</div>
             <div className="text-3xl font-black text-gray-900">{currentItem.name}</div>
             <div className="text-blue-500 font-black italic uppercase text-lg">{currentItem.en}</div>
             <div className="text-xs text-gray-400 mt-2">클릭하여 다시 듣기 🔊</div>
          </div>

          <button
            onClick={nextItem}
            className="bg-white text-blue-600 font-black px-12 py-5 rounded-3xl text-2xl shadow-[0_10px_0_rgba(0,0,0,0.1)] hover:-translate-y-1 hover:shadow-[0_15px_0_rgba(0,0,0,0.1)] transition-all active:translate-y-1 active:shadow-none"
          >
            다음 보물 찾기!
          </button>
          
          <div className="mt-4 text-white font-bold animate-pulse">시간이 {BONUS_TIME}초 추가되었습니다!</div>
        </div>
      )}

      {/* 결과 화면 */}
      {gameState === 'RESULTS' && (
        <div className="z-10 flex flex-col items-center animate-in zoom-in duration-500 px-6 w-full py-6 md:py-10 min-h-screen justify-center">
          <div className="w-full max-w-4xl p-6 md:p-10 bg-white rounded-[50px] shadow-2xl flex flex-col border-b-[10px] border-gray-200 relative max-h-[75vh]">
            <HomeButton />
            <div className="text-5xl md:text-7xl mb-3 text-center mt-12 md:mt-0 animate-pulse">🏆</div>
            <h2 className="text-2xl md:text-4xl font-black text-center mb-1 text-gray-900">오늘의 탐험 결과</h2>
            <p className="text-gray-400 text-center font-bold text-xs md:text-sm uppercase mb-6 tracking-widest">{THEMES[selectedTheme].label} 테마</p>
            
            <div className="flex-1 overflow-y-auto mb-6 pr-2 space-y-3 custom-scrollbar">
              {history.length === 0 ? (
                <div className="text-center py-16 text-gray-300 font-black text-lg">찾은 보물이 없어요... 😢</div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {history.map((h, i) => (
                    <div 
                      key={i} 
                      onClick={() => speakItem(h.name, h.en)}
                      className="flex items-center bg-gray-50 p-4 rounded-3xl border-2 border-transparent hover:border-blue-100 hover:bg-blue-50/30 cursor-pointer transition-all group"
                    >
                      <span className="text-3xl md:text-4xl mr-4 group-hover:scale-125 transition-transform">{h.emoji}</span>
                      <div className="flex-1 min-w-0 text-left">
                        <div className="font-black text-gray-800 text-base md:text-lg truncate">{h.name}</div>
                        <div className="text-[9px] md:text-[10px] text-blue-500 font-black uppercase tracking-wider">{h.en}</div>
                      </div>
                      <div className="text-[9px] md:text-[10px] font-bold text-gray-300 ml-2 whitespace-nowrap">{h.time}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-col md:flex-row items-center justify-between gap-4 md:gap-8 pt-4 border-t border-gray-100">
              <div className="bg-blue-50 px-8 py-4 rounded-[25px] text-center flex-1 w-full">
                <div className="text-[10px] md:text-xs font-black text-blue-300 uppercase mb-1 tracking-widest">Total Score</div>
                <div className="text-4xl md:text-5xl font-black text-blue-600 leading-none">{score}</div>
              </div>

              <div className="flex space-x-3 w-full md:w-auto">
                <button
                  onClick={() => setGameState('THEME_SELECT')}
                  className="flex-1 md:w-40 bg-[#ffca28] hover:bg-[#ffb300] text-gray-900 font-black py-3 md:py-4 rounded-3xl text-base md:text-lg shadow-[0_5px_0_rgb(217,163,0)] transition-all active:translate-y-1 active:shadow-none"
                >
                  다시 하기
                </button>
                <button
                  onClick={goToHome}
                  className="px-5 md:px-7 bg-gray-100 hover:bg-gray-200 text-gray-400 font-black rounded-3xl transition-colors text-sm"
                >
                  홈
                </button>
              </div>
            </div>
          </div>
          <AklabsFooter />
        </div>
      )}

      {error && (
        <div className="fixed top-10 left-1/2 -translate-x-1/2 bg-red-600 text-white px-8 py-4 rounded-2xl shadow-2xl z-[300] font-black">{error}</div>
      )}

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}
