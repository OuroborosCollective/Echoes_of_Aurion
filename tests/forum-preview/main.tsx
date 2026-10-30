import { createRoot } from "react-dom/client";
import ForumAdminEditor from "../../client/src/components/ForumAdminEditor";
import "./styles.css";
// Test-only synthetic tRPC fixture, never a production authentication or persistence claim.
createRoot(document.getElementById("root")!).render(<ForumAdminEditor />);
