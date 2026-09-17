const fs = require("fs");
const file = "client/src/xaurion/audio/SoundManager.tsx";
let content = fs.readFileSync(file, "utf8");

content = content.replace(
  /const \[isMuted, setIsMuted\] = useState\(false\);/,
  `const [isMuted, setIsMuted] = useState(() => {
    const saved = localStorage.getItem("aurion:audio:isMuted");
    return saved ? JSON.parse(saved) : false;
  });`
);

content = content.replace(
  /const \[masterVolume, setMasterVolume\] = useState\(0\.78\);/,
  `const [masterVolume, setMasterVolume] = useState(() => {
    const saved = localStorage.getItem("aurion:audio:masterVolume");
    return saved ? parseFloat(saved) : 0.78;
  });`
);

// find where to insert the useEffects for saving preferences
const useEffectSave = `
  useEffect(() => {
    localStorage.setItem("aurion:audio:isMuted", JSON.stringify(isMuted));
  }, [isMuted]);

  useEffect(() => {
    localStorage.setItem("aurion:audio:masterVolume", masterVolume.toString());
  }, [masterVolume]);
`;

content = content.replace(
  /const duckingTimeoutRef = useRef<NodeJS\.Timeout \| null>\(null\);/,
  `const duckingTimeoutRef = useRef<NodeJS.Timeout | null>(null);\n\n${useEffectSave}`
);

fs.writeFileSync(file, content);
