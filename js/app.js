/**
 * js/app.js
 * "내 이야기를 들어줘!" 앱의 메인 동작 로직
 *
 * 이 파일이 하는 일:
 * 1. API 키 입력 화면 처리 (키 검증, 저장)
 * 2. 채팅 화면으로 전환
 * 3. 메시지 전송 및 화면에 표시
 * 4. 설정 모달 열기/닫기
 * 5. 대화 기록 관리 (문맥 유지)
 */

// GeminiAPI 인스턴스 (js/api.js에서 정의된 클래스)
const geminiAPI = new GeminiAPI();

// 대화 기록 배열 (소담이가 이전 대화를 기억하기 위해 사용)
let conversationHistory = [];

// 현재 답변을 기다리는 중인지 여부 (중복 전송 방지)
let isWaitingForResponse = false;

// HTML 요소 참조
const apiKeyScreen    = document.getElementById('api-key-screen');
const apiKeyInput     = document.getElementById('api-key-input');
const togglePasswordBtn = document.getElementById('toggle-password');
const startChatBtn    = document.getElementById('start-chat-btn');
const apiKeyError     = document.getElementById('api-key-error');
const chatScreen      = document.getElementById('chat-screen');
const chatMessages    = document.getElementById('chat-messages');
const welcomeArea     = document.getElementById('welcome-area');
const messageInput    = document.getElementById('message-input');
const sendBtn         = document.getElementById('send-btn');
const charCounter     = document.getElementById('char-counter');
const openSettingsBtn  = document.getElementById('open-settings-btn');
const closeSettingsBtn = document.getElementById('close-settings-btn');
const modalOverlay     = document.getElementById('modal-overlay');
const settingsModal    = document.getElementById('settings-modal');
const newApiKeyInput   = document.getElementById('new-api-key-input');
const toggleNewPasswordBtn = document.getElementById('toggle-new-password');
const changeApiKeyBtn  = document.getElementById('change-api-key-btn');
const resetChatBtn     = document.getElementById('reset-chat-btn');
const toast        = document.getElementById('toast');
const toastMessage = document.getElementById('toast-message');

// 초기화 함수: 페이지 로드 후 가장 먼저 실행
function init() {
  // 로컬 스토리지에 저장된 API 키가 있으면 자동 로그인
  const savedApiKey = localStorage.getItem('gemini_api_key');
  if (savedApiKey) {
    try {
      geminiAPI.setApiKey(savedApiKey);
      showChatScreen();
    } catch (e) {
      localStorage.removeItem('gemini_api_key');
    }
  }
  setupEventListeners();
}

// 이벤트 리스너 설정
function setupEventListeners() {
  togglePasswordBtn.addEventListener('click', () => togglePasswordVisibility(apiKeyInput, togglePasswordBtn));
  startChatBtn.addEventListener('click', handleStartChat);
  apiKeyInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleStartChat(); });
  apiKeyInput.addEventListener('input', () => { apiKeyError.classList.add('hidden'); });
  messageInput.addEventListener('input', handleMessageInput);
  messageInput.addEventListener('keydown', handleMessageKeydown);
  sendBtn.addEventListener('click', handleSendMessage);
  openSettingsBtn.addEventListener('click', openModal);
  closeSettingsBtn.addEventListener('click', closeModal);
  modalOverlay.addEventListener('click', closeModal);
  toggleNewPasswordBtn.addEventListener('click', () => togglePasswordVisibility(newApiKeyInput, toggleNewPasswordBtn));
  changeApiKeyBtn.addEventListener('click', handleChangeApiKey);
  resetChatBtn.addEventListener('click', handleResetChat);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !settingsModal.classList.contains('hidden')) closeModal();
  });
}

// API 키 화면 → 채팅 화면으로 전환
function showChatScreen() {
  apiKeyScreen.classList.remove('active');
  apiKeyScreen.classList.add('hidden');
  chatScreen.classList.remove('hidden');
  chatScreen.classList.add('active');
  if (conversationHistory.length === 0) showWelcomeMessage();
  setTimeout(() => messageInput.focus(), 300);
}

// "상담 시작하기" 버튼 처리
function handleStartChat() {
  const key = apiKeyInput.value.trim();
  if (!key) {
    showApiKeyError('API 키를 입력해 주세요.');
    apiKeyInput.focus();
    return;
  }
  if (key.length < 20) {
    showApiKeyError('올바른 API 키 형식이 아닙니다. 키를 다시 확인해 주세요.');
    return;
  }
  try {
    geminiAPI.setApiKey(key);
    localStorage.setItem('gemini_api_key', key); // 다음 방문 시 자동 로그인
    showChatScreen();
  } catch (e) {
    showApiKeyError(e.message);
  }
}

function showApiKeyError(message) {
  apiKeyError.textContent = message;
  apiKeyError.classList.remove('hidden');
}

// 비밀번호 표시/숨기기 토글
function togglePasswordVisibility(inputEl, btnEl) {
  const isHidden = inputEl.type === 'password';
  inputEl.type = isHidden ? 'text' : 'password';
  const eyeOpen   = btnEl.querySelector('.eye-open');
  const eyeClosed = btnEl.querySelector('.eye-closed');
  if (isHidden) {
    eyeOpen.classList.add('hidden');
    eyeClosed.classList.remove('hidden');
  } else {
    eyeOpen.classList.remove('hidden');
    eyeClosed.classList.add('hidden');
  }
}

// 입력창 글자 수 카운트 및 버튼 활성화
function handleMessageInput() {
  const text = messageInput.value;
  const length = text.length;
  const maxLength = 500;
  charCounter.textContent = `${length} / ${maxLength}`;
  charCounter.classList.toggle('over-limit', length >= maxLength);
  sendBtn.disabled = text.trim().length === 0 || isWaitingForResponse;
  autoResizeTextarea();
}

function autoResizeTextarea() {
  messageInput.style.height = 'auto';
  messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + 'px';
}

// Enter: 전송, Shift+Enter: 줄바꿈
function handleMessageKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    handleSendMessage();
  }
}

// 메시지 전송 (핵심 기능)
async function handleSendMessage() {
  const text = messageInput.value.trim();
  if (!text || isWaitingForResponse) return;

  // 환영 메시지 영역 숨기기
  if (welcomeArea) welcomeArea.style.display = 'none';

  // 입력창 초기화
  messageInput.value = '';
  messageInput.style.height = 'auto';
  charCounter.textContent = '0 / 500';
  charCounter.classList.remove('over-limit');
  sendBtn.disabled = true;

  appendMessage('user', text);  // 사용자 메시지 표시
  isWaitingForResponse = true;   // 대기 상태 시작
  const loadingEl = showLoadingMessage(); // 로딩 애니메이션 표시

  try {
    const reply = await geminiAPI.sendMessage(conversationHistory, text);
    loadingEl.remove();
    appendMessage('ai', reply); // 소담이 응답 표시
    // 대화 기록에 추가 (다음 메시지에서 이전 내용 기억)
    conversationHistory.push({ role: 'user',  parts: [{ text }] });
    conversationHistory.push({ role: 'model', parts: [{ text: reply }] });
  } catch (error) {
    loadingEl.remove();
    showErrorMessage(error.message);
  } finally {
    isWaitingForResponse = false;
    sendBtn.disabled = messageInput.value.trim().length === 0;
    messageInput.focus();
  }
}

// 메시지를 채팅창에 추가 (role: 'ai' 또는 'user')
function appendMessage(role, text) {
  const now = new Date();
  const timeStr = now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
  const messageItem = document.createElement('div');
  messageItem.className = `message-item ${role}`;
  if (role === 'ai') {
    messageItem.innerHTML = `
      <div class="message-avatar">🧸</div>
      <div class="message-group">
        <div class="message-bubble">${escapeHtml(text)}</div>
        <span class="message-time">${timeStr}</span>
      </div>
    `;
  } else {
    messageItem.innerHTML = `
      <div class="message-group">
        <div class="message-bubble">${escapeHtml(text)}</div>
        <span class="message-time">${timeStr}</span>
      </div>
    `;
  }
  chatMessages.appendChild(messageItem);
  scrollToBottom();
  return messageItem;
}

// 로딩 애니메이션 (점 3개)
function showLoadingMessage() {
  const loadingItem = document.createElement('div');
  loadingItem.className = 'message-item ai';
  loadingItem.innerHTML = `
    <div class="message-avatar">🧸</div>
    <div class="message-group">
      <div class="loading-bubble">
        <span class="loading-dot"></span>
        <span class="loading-dot"></span>
        <span class="loading-dot"></span>
      </div>
    </div>
  `;
  chatMessages.appendChild(loadingItem);
  scrollToBottom();
  return loadingItem;
}

// 오류 메시지 표시
function showErrorMessage(message) {
  const errorItem = document.createElement('div');
  errorItem.className = 'message-item ai';
  errorItem.innerHTML = `
    <div class="message-avatar">🧸</div>
    <div class="message-group">
      <div class="error-bubble">⚠️ ${escapeHtml(message)}</div>
    </div>
  `;
  chatMessages.appendChild(errorItem);
  scrollToBottom();
}

// 소담이의 환영 메시지
function showWelcomeMessage() {
  const welcomeText = `안녕하세요. 저는 24시간 여러분의 이야기를 들어드리는 소담이예요. 😊\n\n오늘 어떤 마음으로 오셨나요? 편하게 이야기해 주세요.\n무엇이든 판단 없이 들어드릴게요.`;
  appendMessage('ai', welcomeText);
}

// 채팅창을 맨 아래로 스크롤
function scrollToBottom() {
  setTimeout(() => { chatMessages.scrollTop = chatMessages.scrollHeight; }, 50);
}

// XSS 방지: HTML 특수문자 이스케이프
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML.replace(/\n/g, '<br>');
}

// 설정 모달 열기/닫기
function openModal() {
  modalOverlay.classList.remove('hidden');
  settingsModal.classList.remove('hidden');
}

function closeModal() {
  modalOverlay.classList.add('hidden');
  settingsModal.classList.add('hidden');
  newApiKeyInput.value = '';
}

// API 키 변경
function handleChangeApiKey() {
  const newKey = newApiKeyInput.value.trim();
  if (!newKey) { showToast('새 API 키를 입력해 주세요.', 'error'); return; }
  if (newKey.length < 20) { showToast('올바른 API 키 형식이 아닙니다.', 'error'); return; }
  try {
    geminiAPI.setApiKey(newKey);
    localStorage.setItem('gemini_api_key', newKey);
    closeModal();
    showToast('API 키가 변경되었습니다. ✓', 'success');
  } catch (e) {
    showToast(e.message, 'error');
  }
}

// 대화 초기화
function handleResetChat() {
  if (!confirm('대화 내용을 모두 초기화하시겠습니까?\n소담이와의 모든 대화가 삭제됩니다.')) return;
  conversationHistory = [];
  chatMessages.innerHTML = '';
  const welcomeDiv = document.createElement('div');
  welcomeDiv.className = 'welcome-area';
  welcomeDiv.innerHTML = `<div class="welcome-icon">🌸</div><p class="welcome-text">안전하고 따뜻한 공간에 오신 걸 환영해요</p>`;
  chatMessages.appendChild(welcomeDiv);
  showWelcomeMessage();
  closeModal();
  showToast('대화가 초기화되었습니다.', 'success');
}

// 토스트 알림 표시
let toastTimeout = null;
function showToast(message, type = 'default') {
  if (toastTimeout) clearTimeout(toastTimeout);
  toastMessage.textContent = message;
  toast.className = 'toast';
  if (type === 'success') toast.classList.add('success');
  if (type === 'error')   toast.classList.add('error');
  toast.classList.remove('hidden');
  toastTimeout = setTimeout(() => { toast.classList.add('hidden'); }, 2500);
}

// DOM 로드 완료 후 앱 시작
document.addEventListener('DOMContentLoaded', init);
