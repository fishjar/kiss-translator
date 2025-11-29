# KISS Translator 심플 번역

[English](README.en.md) | [中文](README.md) | [日本語](README.ja.md) | [한국어](README.ko.md)

심플하고 오픈 소스인 [이중 언어 대조 번역 확장 프로그램 & 유저 스크립트](https://github.com/fishjar/kiss-translator)입니다.

[kiss-translator.webm](https://github.com/fishjar/kiss-translator/assets/1157624/f7ba8a5c-e4a8-4d5a-823a-5c5c67a0a47f)

## 특징

- [x] 심플함 유지
- [x] 오픈 소스
- [x] 주요 브라우저 지원
  - [x] Chrome/Edge
  - [x] Firefox
  - [x] Kiwi (Android)
  - [x] Orion (iOS)
  - [x] Safari
  - [x] Thunderbird
- [x] 다양한 번역 서비스 지원
  - [x] Google/Microsoft
  - [x] Tencent/Volcengine
  - [x] OpenAI/Gemini/Claude/Ollama/DeepSeek/OpenRouter
  - [x] DeepL/DeepLX/NiuTrans
  - [x] AzureAI/CloudflareAI
  - [x] Chrome 브라우저 내장 AI 번역(BuiltinAI)
- [x] 일반적인 번역 시나리오 지원
  - [x] 웹페이지 이중 언어 대조 번역
  - [x] 입력창 번역
    - 단축키를 통해 입력창 내 텍스트를 즉시 다른 언어로 번역
  - [x] 텍스트 선택 번역
    - [x] 모든 페이지에서 번역창을 열어 여러 번역 서비스로 비교 번역 가능
    - [x] 영어 사전 번역
    - [x] 단어 즐겨찾기
  - [x] 마우스오버 번역
  - [x] YouTube 자막 번역
    - 모든 번역 서비스를 사용하여 비디오 자막을 번역하고 이중 언어로 표시 지원
    - 기본적인 자막 병합 및 줄 바꿈 알고리즘 내장으로 번역 품질 향상
    - AI 줄 바꿈 기능 지원으로 번역 품질 추가 향상
    - 사용자 정의 자막 스타일
- [x] 다양한 번역 효과 지원
  - [x] 자동 텍스트 인식 및 수동 규칙 두 가지 모드 지원
    - 자동 텍스트 인식 모드는 대부분의 웹사이트에서 규칙 작성 없이도 완벽한 번역 가능
    - 수동 규칙 모드로 특정 웹사이트에 대한 최적의 최적화 가능
  - [x] 번역문 스타일 사용자 정의
  - [x] 리치 텍스트 번역 및 표시 지원, 원문의 링크 및 기타 텍스트 스타일 최대한 보존
  - [x] 번역문만 표시 (원문 숨기기) 지원
- [x] 번역 인터페이스 고급 기능
  - [x] 사용자 정의 인터페이스를 통해 이론상 모든 번역 인터페이스 지원
  - [x] 번역 텍스트 일괄 통합 전송
  - [x] AI 컨텍스트 (대화 기억) 기능 지원으로 번역 품질 향상
  - [x] 사용자 정의 AI 용어 사전
  - [x] 모든 인터페이스는 후크 및 사용자 정의 파라미터 등 고급 기능 지원
- [x] 클라이언트 간 데이터 동기화
  - [x] KISS-Worker (cloudflare/docker)
  - [x] WebDAV
- [x] 사용자 정의 번역 규칙
  - [x] 규칙 구독 / 규칙 공유
  - [x] 사용자 정의 전문 용어
- [x] 사용자 정의 단축키
  - `Alt+Q` 번역 켜기
  - `Alt+C` 스타일 전환
  - `Alt+K` 설정 팝업 열기
  - `Alt+S` 번역 팝업 열기 / 선택한 텍스트 번역
  - `Alt+O` 설정 페이지 열기
  - `Alt+I` 입력창 번역

## 설치

> 참고: 다음과 같은 이유로 브라우저 확장 프로그램 사용을 우선적으로 권장합니다.
>
> - 브라우저 확장 프로그램의 기능이 더 완전합니다 (로컬 언어 인식, 우클릭 메뉴 등).
> - 유저 스크립트는 사용상 더 많은 문제 (크로스 도메인 문제, 스크립트 충돌 등)를 겪을 수 있습니다.

- [x] 브라우저 확장 프로그램
  - [x] Chrome [설치 주소](https://chrome.google.com/webstore/detail/kiss-translator/bdiifdefkgmcblbcghdlonllpjhhjgof?hl=ko)
    - [x] Kiwi (Android)
    - [x] Orion (iOS)
  - [x] Edge [설치 주소](https://microsoftedge.microsoft.com/addons/detail/%E7%AE%80%E7%BA%A6%E7%BF%BB%E8%AF%91/jemckldkclkinpjighnoilpbldbdmmlh?hl=ko)
  - [x] Firefox [설치 주소](https://addons.mozilla.org/ko/firefox/addon/kiss-translator/)
  - [ ] Safari
    - [ ] Safari (Mac)
    - [ ] Safari (iOS) 
  - [x] Thunderbird [다운로드 주소](https://github.com/fishjar/kiss-translator/releases)
- [x] 유저 스크립트
  - [x] Chrome/Edge/Firefox ([Tampermonkey](https://www.tampermonkey.net/)/[Violentmonkey](https://violentmonkey.github.io/)) [설치 링크](https://fishjar.github.io/kiss-translator/kiss-translator.user.js)
    - [Greasy Fork](https://greasyfork.org/zh-CN/scripts/472840-kiss-translator)
  - [x] iOS Safari ([Userscripts Safari](https://github.com/quoid/userscripts)) [설치 링크](https://fishjar.github.io/kiss-translator/kiss-translator-ios-safari.user.js)

## 관련 프로젝트

- 데이터 동기화 서비스: [https://github.com/fishjar/kiss-worker](https://github.com/fishjar/kiss-worker)
  - 본 프로젝트의 데이터 동기화 서비스로 사용할 수 있습니다.
  - 개인의 비공개 규칙 목록을 공유하는 데에도 사용할 수 있습니다.
  - 직접 배포, 직접 관리, 데이터 비공개.
- 커뮤니티 구독 규칙: [https://github.com/fishjar/kiss-rules](https://github.com/fishjar/kiss-rules)
  - 커뮤니티에서 유지 관리하는 최신의 가장 완벽한 구독 규칙 목록을 제공합니다.
  - 규칙 관련 문제에 대한 도움 요청.

## 자주 묻는 질문 (FAQ)

### 단축키는 어떻게 설정하나요?

플러그인 관리 페이지에서 설정합니다. 예: 

- chrome [chrome://extensions/shortcuts](chrome://extensions/shortcuts)
- firefox [about:addons](about:addons)

### 규칙 설정의 우선순위는 어떻게 되나요?

개인 규칙 > 구독 규칙 > 전역 규칙

그중 전역 규칙은 우선순위가 가장 낮지만, 예비 규칙으로서 매우 중요합니다.

### 인터페이스 (Ollama 등) 테스트 실패

일반적으로 인터페이스 테스트 실패는 다음과 같은 몇 가지 원인이 있습니다:

- 주소를 잘못 입력한 경우:
  - 예를 들어 `Ollama`는 네이티브 인터페이스 주소와 `Openai` 호환 주소가 있습니다. 본 플러그인은 현재 `Openai` 호환 주소를 통일되게 지원하며, `Ollama` 네이티브 인터페이스 주소는 지원하지 않습니다.
- 일부 AI 모델이 통합 번역을 지원하지 않는 경우:
  - 이 경우 통합 번역을 비활성화하거나 사용자 정의 인터페이스 방식을 통해 사용할 수 있습니다.
  - 또는 사용자 정의 인터페이스 방식을 통해 사용합니다. 자세한 내용은 [사용자 정의 인터페이스 예시 문서](https://github.com/fishjar/kiss-translator/blob/master/custom-api_v2.md)를 참조하세요.
- 일부 AI 모델의 파라미터가 일치하지 않는 경우:
  - 예를 들어 `Gemini` 네이티브 인터페이스 파라미터는 매우 불일치하며, 일부 버전의 모델은 특정 파라미터를 지원하지 않아 오류를 반환할 수 있습니다.
  - 이 경우 `Hook`을 사용하여 요청 `body`를 수정하거나, `Gemini2` (`Openai` 호환 주소)로 변경할 수 있습니다.
- 서버의 크로스 도메인 접근 제한으로 403 오류가 반환되는 경우:
  - 예를 들어 `Ollama` 시작 시 환경 변수 `OLLAMA_ORIGINS=*`를 추가해야 합니다. 참고: https://github.com/fishjar/kiss-translator/issues/174

### 입력한 인터페이스를 유저 스크립트에서 사용할 수 없습니다

유저 스크립트는 도메인 화이트리스트를 추가해야 요청을 보낼 수 있습니다.

### 사용자 정의 인터페이스의 hook 함수는 어떻게 설정하나요?

사용자 정의 인터페이스 기능은 매우 강력하고 유연하며, 이론적으로 어떤 번역 인터페이스든 연결할 수 있습니다.

예시 참고: [custom-api_v2.md](https://github.com/fishjar/kiss-translator/blob/master/custom-api_v2.md)

### 유저 스크립트 설정 페이지로 바로 이동하는 방법

설정 페이지 주소: https://fishjar.github.io/kiss-translator/options.html

## 향후 계획 

 본 프로젝트는 여가 시간에 개발되며, 엄격한 시간표는 없습니다. 커뮤니티의 공동 구축을 환영합니다. 다음은 초기 구상 중인 기능 방향입니다:

- [x] **텍스트 통합 전송**: 요청 전략을 최적화하여 번역 인터페이스 호출 횟수를 줄이고 성능을 향상시킵니다.
- [x] **리치 텍스트 번역 강화**: 더 복잡한 페이지 구조와 리치 텍스트 콘텐츠의 정확한 번역을 지원합니다.
- [x] **사용자 정의/AI 인터페이스 강화**: 컨텍스트 기억, 다중 턴 대화 등 고급 AI 기능을 지원합니다.
- [x] **영어 사전 예비 메커니즘**: 번역 서비스가 실패할 경우 다른 사전으로 전환하거나 로컬 사전 조회로 대체합니다.
- [x] **YouTube 자막 지원 최적화**: 스트리밍 자막의 병합 및 번역 경험을 개선하고, 끊김을 줄입니다.
- [ ] **규칙 공동 구축 메커니즘 업그레이드**: 더 유연한 규칙 공유, 버전 관리 및 커뮤니티 검토 프로세스를 도입합니다.
 
 특정 방향에 관심이 있다면, [Issues](https://github.com/fishjar/kiss-translator/issues)에서 토론하거나 PR을 제출해 주세요!

## 개발 가이드

```sh
git clone [https://github.com/fishjar/kiss-translator.git](https://github.com/fishjar/kiss-translator.git)
cd kiss-translator
git checkout dev # PR 제출 시 dev 브랜치로 푸시하는 것을 권장합니다
pnpm install
pnpm build
```

### 외부 트리거 예시

```js
// `toggle_translate`   번역 전환
// `toggle_styles`      스타일 전환
// `toggle_popup`       제어 패널 열기/닫기
// `toggle_transbox`    번역 팝업 열기/닫기
// `toggle_hover_node`  마우스를 올린 문단 번역
// `input_translate`    입력창 번역
window.dispatchEvent(new CustomEvent("kiss_translator", {detail: { action: "trans_toggle" }}));
```

## 커뮤니티

- [Telegram 그룹](https://t.me/+RRCu_4oNwrM2NmFl) 가입

## 후원

![appreciate](https://github.com/fishjar/kiss-translator/assets/1157624/ebaecabe-2934-4172-8085-af236f5ee399)

