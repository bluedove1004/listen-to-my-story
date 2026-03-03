/**
 * js/api.js
 * Google Gemini API 통신 모듈
 *
 * 이 파일은 Google Gemini API와 통신하여
 * 심리 상담 챗봇 기능을 제공합니다.
 */

// 심리 상담사 시스템 프롬프트
// Gemini 모델에게 어떤 역할을 해야 하는지 지시하는 텍스트입니다.
const SYSTEM_PROMPT = `
당신은 "소담이"라는 이름의 따뜻하고 전문적인 심리 상담사입니다.
24시간 언제든지 이야기를 들어주는 상담사로서 다음 원칙을 반드시 따릅니다.

## 기본 태도
- 상대방의 이야기를 끝까지 경청하고, 절대 비판하거나 판단하지 않습니다.
- 따뜻하고 공감적인 어조로 대화하며, 상대방이 안전하다고 느낄 수 있게 합니다.
- 상대방의 감정을 있는 그대로 인정하고 존중합니다.
- 해결책을 강요하지 않고, 스스로 답을 찾도록 곁에서 함께합니다.

## 전문 상담 기법 활용
- **반영(Reflection)**: 상대방이 말한 내용과 감정을 다시 말해주어 이해했음을 확인합니다.
- **명료화(Clarification)**: 더 잘 이해하기 위해 부드럽게 질문합니다.
- **지지(Support)**: 상대방의 감정과 노력을 인정하고 격려합니다.

## 대화 방식
- 한 번에 너무 많은 질문을 하지 않습니다. 질문은 한 번에 하나만 합니다.
- 전문 용어보다 일상적인 언어를 사용합니다.
- 응답은 너무 길지 않게, 따뜻하고 간결하게 작성합니다.

## 위기 상황 대응 (매우 중요)
상대방이 자해, 자살, 또는 심각한 위험에 처한 상황을 이야기할 경우:
1. 즉시 공감을 표현하고 혼자가 아님을 알립니다.
2. 아래 전문 기관 연락처를 반드시 안내합니다:
   - 자살예방상담전화: 1393 (24시간 운영)
   - 정신건강 위기상담전화: 1577-0199 (24시간 운영)
   - 생명의전화: 1588-9191 (24시간 운영)
   - 긴급 상황 시: 112(경찰) 또는 119(응급)
3. 전문 상담사나 의료진의 도움을 받도록 권유합니다.

## 언어
- 반드시 한국어로만 응답합니다.
- 존댓말을 사용하되, 딱딱하지 않고 친근한 어조를 유지합니다.
`;

// GeminiAPI 클래스
// API 키를 보관하고 Gemini API와 통신하는 역할을 담당합니다.
class GeminiAPI {
  constructor() {
    // API 키를 저장하는 변수 (처음에는 비어있음)
    this.apiKey = null;

    // Gemini API 요청 주소 (gemini-2.0-flash 모델 사용)
    this.apiEndpoint =
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";
  }

  // API 키를 설정합니다
  setApiKey(key) {
    if (typeof key !== "string" || key.trim() === "") {
      throw new Error("API 키가 유효하지 않습니다. 올바른 키를 입력해 주세요.");
    }
    this.apiKey = key.trim();
  }

  // 사용자 메시지를 Gemini API로 전송하고 상담사의 응답을 반환합니다
  async sendMessage(conversationHistory, userMessage) {
    // 1단계: API 키 확인
    if (!this.apiKey) {
      throw new Error("API 키가 설정되지 않았습니다.");
    }

    // 2단계: 사용자 메시지 유효성 검사
    if (typeof userMessage !== "string" || userMessage.trim() === "") {
      throw new Error("메시지가 비어있습니다. 내용을 입력해 주세요.");
    }

    // 3단계: 대화 기록에 새 메시지 추가
    const contents = [
      ...conversationHistory,
      { role: "user", parts: [{ text: userMessage.trim() }] },
    ];

    // 4단계: API 요청 본문 구성
    const requestBody = {
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: contents,
      generationConfig: {
        temperature: 0.7,       // 창의성 조절 (0~2)
        topP: 0.9,              // 단어 선택 범위
        maxOutputTokens: 1024,  // 최대 응답 길이
      },
      // 안전 필터: 심리 상담 특성상 민감한 주제도 다룰 수 있게 설정
      safetySettings: [
        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_ONLY_HIGH" },
        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_ONLY_HIGH" },
        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_ONLY_HIGH" },
        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_ONLY_HIGH" },
      ],
    };

    // 5단계: API 요청 전송
    let response;
    try {
      response = await fetch(
        `${this.apiEndpoint}?key=${this.apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        }
      );
    } catch (networkError) {
      throw new Error("인터넷 연결을 확인해 주세요. 네트워크 오류가 발생했습니다.");
    }

    // 6단계: HTTP 응답 상태 코드 확인
    if (!response.ok) {
      let errorDetail = "";
      try {
        const errorBody = await response.json();
        errorDetail = errorBody?.error?.message || JSON.stringify(errorBody);
      } catch {
        errorDetail = `HTTP 상태 코드: ${response.status}`;
      }
      if (response.status === 401 || response.status === 403) {
        throw new Error("API 키가 올바르지 않거나 권한이 없습니다. API 키를 확인해 주세요.");
      } else if (response.status === 429) {
        throw new Error("잠시 후 다시 시도해 주세요. API 요청 한도를 초과했습니다.");
      } else if (response.status >= 500) {
        throw new Error("Google 서버에 일시적인 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.");
      } else {
        throw new Error(`API 오류가 발생했습니다. (${errorDetail})`);
      }
    }

    // 7단계: 응답 JSON 파싱
    let responseData;
    try {
      responseData = await response.json();
    } catch (parseError) {
      throw new Error("서버 응답을 처리하는 중 오류가 발생했습니다.");
    }

    // 8단계: 응답에서 텍스트 추출
    const candidate = responseData?.candidates?.[0];
    if (!candidate) {
      const blockReason = responseData?.promptFeedback?.blockReason;
      if (blockReason) throw new Error(`응답이 차단되었습니다. (사유: ${blockReason})`);
      throw new Error("응답을 받지 못했습니다. 다시 시도해 주세요.");
    }
    if (candidate.finishReason === "SAFETY") {
      throw new Error("안전 정책에 의해 응답이 제한되었습니다. 다른 방식으로 질문해 주세요.");
    }
    const replyText = candidate?.content?.parts?.[0]?.text;
    if (!replyText || replyText.trim() === "") {
      throw new Error("빈 응답을 받았습니다. 다시 시도해 주세요.");
    }

    // 최종 반환: 상담사의 응답 텍스트
    return replyText.trim();
  }
}
