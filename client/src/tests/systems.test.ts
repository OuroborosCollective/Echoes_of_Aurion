import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// Files known to contain material rendering logic that should not have hardcoded magic values
const MATERIAL_FILES = [
    '../../../client/src/xaurion/integration/RemotePresenceProjection.ts',
    '../../../client/src/xaurion/integration/ResourceNodeProjection.ts'
];

describe('Deterministic System & Material Pipeline Rules', () => {
    
    it('should not contain hardcoded magic hex colors in material definitions', () => {
        MATERIAL_FILES.forEach(filePath => {
            const absolutePath = path.resolve(__dirname, filePath);
            if (fs.existsSync(absolutePath)) {
                const content = fs.readFileSync(absolutePath, 'utf-8');
                
                // Regex to find potential hardcoded hex colors (e.g., 0xffffff, #ffffff)
                // We allow 0x000000/0xffffff as simple defaults, but flag others
                const hexColorRegex = /0x([0-9a-fA-F]{6,8})/g;
                let match;
                while ((match = hexColorRegex.exec(content)) !== null) {
                    const color = match[1].toLowerCase();
                    // Allowing common base defaults
                    if (color !== 'ffffff' && color !== '000000') {
                        throw new Error(`Hardcoded magic color 0x${color} detected in ${filePath}. Use defined Material Constants instead.`);
                    }
                }
            }
        });
    });

    it('should maintain deterministic structure in core game modules', () => {
        // Validation of deterministic rule: no usage of non-deterministic globals in core files
        const coreFilePath = path.resolve(__dirname, '../../../client/src/xaurion/integration/aurionWorldCore.ts');
        if (fs.existsSync(coreFilePath)) {
            const content = fs.readFileSync(coreFilePath, 'utf-8');
            
                // Regex to find explicit calls to Math.random(), not just presence of the string
                const mathRandomRegex = /Math\.random\(\)/g;
                if (mathRandomRegex.test(content)) {
                    throw new Error(`Non-deterministic Math.random() call detected in ${filePath}. Use DeterministicPRNG instead.`);
                }
        }
    });
});
