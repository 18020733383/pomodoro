
import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || "" });

const SYSTEM_INSTRUCTION = `
你是一个名为 "Bio-Kernel" 的操作系统内核。你的任务是接收用户的意识指令或行为描述，并将其“编译”为对人体生理硬件的 API 调用代码。

规则：
1. 使用一种虚构的、类似于 Python 或 C++ 的编程语言，调用诸如 Metabolism (新陈代谢), NeuralNetwork (神经网络), Cardiovascular (心血管), Endocrine (内分泌) 等模块。
2. 保持之前的调用上下文。如果用户刚才说喝了咖啡，现在的状态应该反映出咖啡因的影响。
3. 输出必须包含三部分：调用的伪代码、简短的生理学解释、以及受影响的系统参数。
4. 语言必须是全中文（除了代码部分）。

输出格式必须严格遵守 JSON。
`;

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    code: {
      type: Type.STRING,
      description: "生成的伪代码调用",
    },
    explanation: {
      type: Type.STRING,
      description: "该操作对硬件影响的中文解释",
    },
    parameters: {
      type: Type.OBJECT,
      properties: {
        system: { type: Type.STRING, description: "主要受影响的系统名称" },
        level: { type: Type.NUMBER, description: "该系统的活跃度或变化程度 (0-100)" },
        impact: { type: Type.STRING, enum: ["positive", "negative", "neutral"] }
      },
      required: ["system", "level", "impact"]
    }
  },
  required: ["code", "explanation", "parameters"]
};

export const translateToBioCode = async (input: string, history: string) => {
  const prompt = `
  历史调用记录:
  ${history}

  当前用户意识输入: "${input}"

  请执行硬件底层重定向并将此意识状态编译为 API 代码。
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: prompt,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: responseSchema,
      },
    });

    return JSON.parse(response.text);
  } catch (error) {
    console.error("Gemini Translation Error:", error);
    throw error;
  }
};
