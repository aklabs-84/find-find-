import { FilesetResolver, ObjectDetector, ImageClassifier } from '@mediapipe/tasks-vision';

// 아이템(en) → 두 모델이 부르는 이름. det = 물체 감지(COCO), cls = 이미지 분류(ImageNet, 부분 일치)
const TARGETS: Record<string, { det?: string[]; cls?: string[] }> = {
  Smartphone: { det: ['cell phone'], cls: ['cellular telephone'] },
  Cup: { det: ['cup'], cls: ['coffee mug', 'cup'] },
  Glasses: { cls: ['sunglass'] },
  Book: { det: ['book'] },
  Sofa: { det: ['couch'] },
  Television: { det: ['tv'] },
  Keyboard: { det: ['keyboard'], cls: ['computer keyboard'] },
  Mouse: { det: ['mouse'] },
  Pen: { cls: ['ballpoint', 'fountain pen'] },
  Watch: { det: ['clock'], cls: ['digital watch', 'stopwatch'] },
  Laptop: { det: ['laptop'], cls: ['laptop'] },
  Folder: { cls: ['binder'] },
  Apple: { det: ['apple'] },
  Tumbler: { det: ['bottle', 'cup'], cls: ['water bottle', 'water jug'] },
  Banana: { det: ['banana'], cls: ['banana'] },
  Fork: { det: ['fork'] },
  Pan: { cls: ['frying pan'] },
  Bowl: { det: ['bowl'], cls: ['soup bowl', 'mixing bowl'] },
};

const DET_YES = 0.5;
const DET_HINT = 0.25;
const CLS_YES = 0.2;
const CLS_HINT = 0.08;

export type VisionResult = 'YES' | 'HINT' | 'NO';

let detector: ObjectDetector | null = null;
let classifier: ImageClassifier | null = null;
let loading: Promise<void> | null = null;

// 모델은 앱 안(public/)에 들어 있어서 처음 한 번만 불러오면 인터넷 없이도 동작해요
export const loadVision = () => {
  if (!loading) {
    loading = (async () => {
      const base = import.meta.env.BASE_URL;
      const fileset = await FilesetResolver.forVisionTasks(`${base}mediapipe-wasm`);
      detector = await ObjectDetector.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: `${base}models/efficientdet_lite0.tflite` },
        scoreThreshold: DET_HINT,
        runningMode: 'IMAGE',
      });
      classifier = await ImageClassifier.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: `${base}models/efficientnet_lite0.tflite` },
        maxResults: 8,
        runningMode: 'IMAGE',
      });
    })().catch(err => {
      loading = null;
      throw err;
    });
  }
  return loading;
};

export const checkTarget = (video: HTMLVideoElement, en: string): VisionResult => {
  const target = TARGETS[en];
  if (!target || !detector || !classifier) return 'NO';

  let best = 0; // 0 = 없음, 1 = 힌트, 2 = 정답
  const mark = (level: number) => { if (level > best) best = level; };

  if (target.det) {
    for (const d of detector.detect(video).detections) {
      const c = d.categories[0];
      if (c && target.det.includes(c.categoryName)) {
        mark(c.score >= DET_YES ? 2 : 1);
      }
    }
  }

  if (target.cls && best < 2) {
    const cats = classifier.classify(video).classifications[0]?.categories ?? [];
    for (const c of cats) {
      const name = c.categoryName.toLowerCase();
      if (target.cls.some(k => name.includes(k))) {
        mark(c.score >= CLS_YES ? 2 : c.score >= CLS_HINT ? 1 : 0);
      }
    }
  }

  return best === 2 ? 'YES' : best === 1 ? 'HINT' : 'NO';
};
