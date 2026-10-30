# KISS Translator 심플 번역

[English](README.en.md) | [中文](README.md) | [日本語](README.ja.md) | [한국어](README.ko.md)

[![GitHub Release](https://img.shields.io/github/v/release/fishjar/kiss-translator?color=blue)](https://github.com/fishjar/kiss-translator/releases)
[![License: GPL-3.0](https://img.shields.io/badge/License-GPL_3.0-green.svg)](https://github.com/fishjar/kiss-translator/blob/master/LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/fishjar/kiss-translator/pulls)

심플하고 오픈 소스인 [이중 언어 대조 번역 확장 프로그램 & 유저 스크립트](https://github.com/fishjar/kiss-translator)입니다.

[kiss-translator.webm](https://github.com/fishjar/kiss-translator/assets/1157624/f7ba8a5c-e4a8-4d5a-823a-5c5c67a0a47f)

## 본 프로젝트를 후원해 주시는 스폰서에 감사드립니다

<table>
  <tr>
    <td align="center"><img src="https://github.com/user-attachments/assets/8c5f141d-9d13-46b0-832f-f6884db4e5d5" width="600" /></td>
    <td>
      <a href="https://go.apimart.ai/gh-gotranslatorrr" target="_blank">
        <b>APIMart</b>는 AI 이미지 및 비디오 생성에 특화된 저비용 API 플랫폼입니다. GPT-Image-2는 장당 $0.006부터 시작하여 1달러로 160장 이상의 이미지를 생성할 수 있습니다. 이미지와 비디오를 하나의 비동기 API로 처리하며, 작업 제출 후 ID 획득 및 콜백으로 결과를 받아볼 수 있습니다. 수만 장 배치 처리에도 타임아웃이 없으며 코드 변경 없이 모델을 교체할 수 있습니다. 종량제 과금 방식 및 월 구독료 없음, 해당 링크를 통해 가입 후 바로 이용하실 수 있습니다.
      </a>
    </td>
  </tr>
  <tr>
    <td align="center"><img src="https://platform.ephone.ai/logo-e.png" width="96" /></td>
    <td>
      <a href="https://platform.ephone.ai/" target="_blank">
        <b>ePhone AI</b>는 개발자를 위한 AI 모델 API 중계 및 통합 플랫폼으로, OpenAI, Claude, Gemini, DeepSeek, GLM 등 다양한 대형 모델을 지원합니다.
      </a>
    </td>
  </tr>
</table>

## 기능 개요

> **안내**: 이 README는 현재 개발 브랜치의 코드를 설명합니다. 새 기능(인터페이스 플러그인, 로컬 AI, 파일 번역, 클립보드 자동 번역 등)은 현재 Chrome/Edge 및 Firefox 확장 프로그램 버전에서 제공되며, 유저 스크립트 및 기타 클라이언트에는 해당 메뉴가 제공되지 않습니다. 구체적인 AI 지원 기능은 브라우저, 기기 환경, 선택한 모델에 따라 달라집니다.

### 번역 기능과 상호작용

- **다양한 번역 환경 지원**: 웹페이지 원문·번역 대조 표시, 입력란 즉시 번역, 텍스트 선택 단어 조회, 마우스 호버 번역 지원. 서식 있는 텍스트(Rich Text) 레이아웃 보존, 번역 스타일 맞춤 설정, '번역문만 표시(원문 숨기기)' 모드를 지원합니다.
- **단어 조회 및 비교 패널**: 번역 팝업 및 독립 비교 창을 통해 여러 번역 서비스의 결과를 나란히 대조할 수 있으며, 영영/영한 사전 검색, 단어장 저장, 클립보드 자동 번역 기능을 제공합니다.
- **YouTube 이중 언어 자막**: 스마트 자막 병합 알고리즘 및 AI 문맥 문장 분할 지원. 맞춤형 자막 스타일, 전체 스크립트 대조 목록, 마우스 오버 단어 검색, 단어 저장, 자막 기반 AI 영상 요약을 지원합니다.

### 서비스 설정과 인터페이스 플러그인

- **풍부한 내장 서비스**: Google, Microsoft, Baidu, Tencent, Volcengine, DeepL/DeepLX 등 전통적인 번역 서비스는 물론 OpenAI, Gemini, Claude, Ollama, DeepSeek, OpenRouter, OrcaRouter, Requesty, Runcrate, AzureAI, CloudflareAI 등의 주요 AI 서비스, Chrome 브라우저 내장 AI, 로컬 AI를 지원합니다.
- **기능별 자유로운 서비스 할당**: 텍스트 번역, 사전 검색, 자막 분할, OCR 문자 인식, 음성 합성 등 기능별로 독립된 서비스와 모델 파라미터를 설정할 수 있습니다. 모델 사양에 따라 일괄 배치 번역, 스트리밍 출력, 대화 문맥 기억, AI 전문 용어집, 추론(Reasoning) 설정을 지원합니다.
- **인터페이스 플러그인 생태계**: 공식 및 외부 플러그인을 별도 목록에서 선택하고 클릭하여 온라인으로 설치할 수 있습니다. ZIP, 로컬 폴더, GitHub 저장소 루트 URL, HTTPS 링크로 가져올 수도 있습니다. 요청은 선언된 네트워크 범위로 제한되며 수동 업데이트와 저장된 서비스 인스턴스 업그레이드를 지원합니다.
- **개방형 커스텀 프로토콜**: 비표준 API도 플러그인을 통해 연동할 수 있습니다. 자세한 내용은 [플러그인 개발 가이드(중국어)](https://github.com/fishjar/kiss-translator-plugins/blob/main/docs/plugin-development-guide.md), [OpenAI 호환 플러그인](https://github.com/fishjar/kiss-translator-plugins/blob/main/plugins/openai-compatible-bundle/README.md), [DeepSeek 플러그인](https://github.com/fishjar/kiss-translator-plugins/blob/main/plugins/deepseek/README.md)를 참고하세요.

### 로컬 AI (엣지 컴퓨팅)

- **온디바이스 멀티모달 AI**: 내장된 모델 센터를 통해 모델 다운로드·삭제 및 실행 환경(GPU/CPU)을 선택할 수 있습니다. LLM 텍스트 생성, VLM 이미지 이해, OCR 문자 인식, ASR 음성 전사, TTS 음성 합성, JEV 판별, 문서 레이아웃 분석 테스트 페이지를 제공합니다.
- **작업 제어 및 캐싱**: 실시간 실행 상태와 로그 확인, 추론 작업 수동 중지, 메모리/VRAM에서 로드된 모델 해제를 지원합니다. 텍스트 및 구조화된 결과의 캐시를 지원합니다(바이너리 오디오/이미지는 현재 제외).
- **데이터 프라이버시 및 오프라인 구동**: 모델 다운로드 후 모든 추론이 사용자 로컬 기기에서 완전히 실행되어 개인정보를 안전하게 보호합니다. 클라우드 서비스는 기존 네트워크 요청을 유지합니다. (지원 여부, 속도, 메모리 점유율은 기기 사양과 모델 크기에 따라 다릅니다).

### 파일 번역

- **다양한 파일 형식 지원**: TXT, Markdown, PDF, EPUB 전자책, PNG/JPEG/WebP 이미지를 지원합니다. 번역, OCR 인식, 레이아웃 분석, 표·수식 분석 작업을 독립된 전용 서비스에 개별 할당할 수 있습니다.
- **고정밀 PDF 분석**: 원문 열람, 레이아웃 감지, 문자 인식, 표/수식 파싱, 단계별 번역 및 결과 캐시를 지원합니다. Markdown, 단일 HTML 또는 리소스 포함 ZIP으로 내보낼 수 있습니다 (원본 PDF 레이아웃 복원이나 PDF 내보내기는 지원하지 않습니다).
- **EPUB 전자책 번역**: 챕터별 읽기 및 번역, 전체 도서 일괄 번역, 읽기 스타일 맞춤 설정을 지원합니다. 이중 언어 EPUB, 번역본 EPUB 또는 현재 챕터 HTML로 내보낼 수 있습니다.
- **텍스트 및 이미지 번역**: TXT 파일은 대조본 또는 번역본 텍스트로 다운로드할 수 있으며, Markdown은 번역된 Markdown/HTML로 내보낼 수 있습니다. 이미지는 문자 인식, 영역 지정 번역 및 번역 이미지(PNG) 다운로드를 지원합니다.

### 규칙·설정·동기화

- **스마트 감지 및 사용자 정의 규칙**: 웹페이지 콘텐츠 자동 인식 스캔을 지원합니다. 시각적 요소 선택기, 초안 편집, 실행 취소/다시 실행, 번역 범위 하이라이트 미리보기, 규칙 구독, 공유, 맞춤형 전문 용어집을 제공합니다.
- **설정 관리 및 테스트 도구**: 설정 전체 검색, 시스템 프롬프트 템플릿 관리, 서비스 연결 테스트 도구, 용어집 및 자막 분할 디버깅 도구를 제공합니다.
- **다중 기기 데이터 동기화**: [KISS-Worker](https://github.com/fishjar/kiss-worker)(Cloudflare Workers 또는 Docker 기반 자체 호스팅) 또는 표준 WebDAV 프로토콜을 통해 모든 설정을 기기 간에 동기화할 수 있습니다.
- **사용자 정의 전역 단축키**:
  - `Alt+Q`: 웹페이지 번역 시작 / 전환
  - `Alt+D`: 독립 번역 창 열기
  - `Alt+K`: 설정 팝업 열기
  - `Alt+S`: 번역 패널 열기 / 선택한 텍스트 번역
  - `Alt+O`: 전체 설정 페이지 열기
  - `Alt+I`: 현재 입력란 번역

## 빠른 시작

### 기본 사용법 (3단계 빠른 시작)

1. **서비스 추가**: 설정의 **서비스 설정**에서 내장 서비스를 추가하고, API 주소, API 키, 모델명을 입력한 뒤 '테스트'를 눌러 정상 작동을 확인하고 저장합니다.
2. **기능별 서비스 연결**: **사용 시나리오 설정**(웹페이지 번역, 단어 검색, 입력란, 자막)에서 원하는 서비스를 선택합니다(해당 기능을 지원하는 서비스만 목록에 표시됩니다). **프롬프트 관리**에서 맞춤형 템플릿을 설정할 수도 있습니다.
3. **번역 시작**: 웹페이지의 플로팅 아이콘을 클릭하거나 단축키 `Alt+Q`를 눌러 번역을 시작합니다. `Alt+D`로 독립 창을 열면 여러 서비스의 번역 결과를 동시에 비교할 수 있습니다.

### 고급 기능 사용법

- **인터페이스 플러그인 사용**: **인터페이스 플러그인** 메뉴에서 ZIP, 폴더, GitHub/HTTPS 링크를 통해 플러그인을 가져오고 권한을 승인합니다. 그 후 **서비스 설정 → 추가 → 외부 플러그인**에서 인스턴스를 생성하고 설정합니다. (※ 권한 승인은 기기 로컬에 저장되므로, 다른 기기로 동기화한 후에는 다시 승인해야 합니다).
- **로컬 AI 사용**: **로컬 AI** 메뉴를 열어 구동 환경(WebGPU/WASM 등)을 확인합니다. **모델 센터**에서 필요한 모델을 다운로드하고 테스트 페이지에서 확인한 뒤, **서비스 설정**에서 해당 로컬 서비스를 추가하여 시나리오별로 지정합니다.
- **문서 및 이미지 번역**: **파일 번역** 메뉴를 열고 파일을 업로드한 뒤 원문과 목표 언어를 설정합니다. 인식 및 번역 서비스를 선택하고 처리를 시작합니다. PDF는 단계별 분석과 번역을 지원하며, EPUB은 챕터별 또는 전체 번역을 지원합니다. 완료 후 원하는 형식으로 내보냅니다.

## 설치

> **브라우저 확장 프로그램 사용을 강력히 권장합니다**:
>
> - 확장 프로그램은 완전한 기능(로컬 언어 감지, 독립 창, 파일 번역, 로컬 AI, 우클릭 메뉴 등)을 지원합니다.
> - 유저 스크립트는 브라우저 샌드박스 제한으로 인해 확장 프로그램 전용 API를 사용할 수 없으며, CORS 또는 스크립트 관리자 호환성 문제가 발생할 수 있습니다.

### 브라우저 확장 프로그램

- **Chrome**: [Chrome 웹 스토어 설치](https://chrome.google.com/webstore/detail/kiss-translator/bdiifdefkgmcblbcghdlonllpjhhjgof?hl=ko) (Android는 Kiwi Browser, iOS는 Orion Browser 지원)
- **Edge**: [Edge 추가 기능 설치](https://microsoftedge.microsoft.com/addons/detail/%E7%AE%80%E7%BA%A6%E7%BF%BB%E8%AF%91/jemckldkclkinpjighnoilpbldbdmmlh?hl=ko)
- **Firefox**: [Firefox 부가 기능 설치](https://addons.mozilla.org/ko/firefox/addon/kiss-translator/)
- **Thunderbird**: [GitHub Releases (.xpi)](https://github.com/fishjar/kiss-translator/releases)
- **Safari**: 아직 지원되지 않음 (Mac / iOS 계획 중)

### 유저 스크립트

- **데스크톱 (Chrome / Edge / Firefox)**: [Tampermonkey](https://www.tampermonkey.net/) 또는 [Violentmonkey](https://violentmonkey.github.io/) 설치 후 아래 링크를 클릭하여 설치:
  - [스크립트 직접 설치 (GitHub Pages)](https://fishjar.github.io/kiss-translator/kiss-translator.user.js)
  - [Greasy Fork 스크립트 페이지](https://greasyfork.org/zh-CN/scripts/472840-kiss-translator)
- **iOS Safari**: [Userscripts Safari](https://github.com/quoid/userscripts) 확장 프로그램 설치 후 아래 링크를 클릭하여 설치:
  - [iOS 전용 스크립트 직접 설치](https://fishjar.github.io/kiss-translator/kiss-translator-ios-safari.user.js)

## 관련 프로젝트

- **[kiss-translator-plugins](https://github.com/fishjar/kiss-translator-plugins)**: 공식 API 플러그인 생태계 저장소로, 주요 AI 및 번역 서비스 플러그인, 템플릿, 개발 가이드를 제공합니다.
- **[KISS-Worker](https://github.com/fishjar/kiss-worker)**: 자체 호스팅 데이터 동기화 서비스로, Cloudflare Workers 서버리스 배포 또는 Docker 배포를 지원하여 데이터 프라이버시 보호와 개인 규칙 공유가 가능합니다.
- **[kiss-rules](https://github.com/fishjar/kiss-rules)**: 커뮤니티에서 유지 관리하는 구독 규칙 저장소로, 최신 웹사이트 적응 규칙을 제공하며 규칙 작성에 대한 도움을 주고받을 수 있습니다.

## 자주 묻는 질문

### 단축키를 변경하려면 어떻게 하나요?

브라우저의 단축키 관리 제한으로 인해 브라우저 자체 관리 페이지에서 변경해야 합니다:

- **Chrome / Edge**: 주소창에 `chrome://extensions/shortcuts` 입력
- **Firefox**: 주소창에 `about:addons` 입력 후 우측 상단 톱니바퀴 아이콘을 클릭하여 '확장 기능 단축키 관리' 선택

### 번역 규칙의 적용 우선순위는 어떻게 되나요?

규칙은 다음 순서로 덮어쓰며 적용됩니다:
**개인 규칙 > 구독 규칙 > 전역 규칙** (전역 규칙이 기본값으로 사용됩니다).

### 웹페이지에서 시각적으로 규칙을 편집하려면 어떻게 하나요?

1. 웹 번역 패널을 열고 '사이트 규칙 편집'을 클릭하여 규칙 목적(번역 대상, 제외 영역, 원문 유지 등)을 선택합니다.
2. 페이지에서 요소를 직접 클릭하거나 CSS 선택자를 수동으로 입력합니다. 상위 부모 경로 조정, 선택자 후보 비교, 매칭된 요소 개수를 실시간으로 확인할 수 있습니다.
3. **초안 시스템**: 모든 수정, 삭제, 실행 취소/다시 실행은 임시 초안에만 반영됩니다. '규칙 저장'을 클릭해야 로컬에 저장되고 동기화됩니다. '예상 번역 범위'는 현재 로드된 DOM 노드를 하이라이트 표시할 뿐, 번역 서비스로 요청을 보내지 않습니다.
4. **상속 복원 및 초기화**: '상속 복원'을 누르면 구독 또는 전역 규칙으로 복귀합니다. '그룹 비우기'는 명시적인 빈 선택자로 설정합니다(루트 컨테이너를 비우면 페이지 전체 스캔을 중단합니다).
5. ※ 시각적 요소 선택은 현재 데스크톱의 표준 DOM 페이지를 지원하며, iframe 내부, Shadow DOM 내부, Canvas 렌더링 텍스트, 터치 제스처는 지원하지 않습니다.

### 서비스 연결 테스트가 실패하면 어떻게 하나요?

- **접속 정보 확인**: 프로토콜, API 주소 URL, API 키, 모델명이 일치하는지 다시 확인하세요. 서비스나 모델이 일괄 배치 요청이나 스트리밍을 지원하지 않는 경우 해당 옵션을 끄세요.
- **Ollama 로컬 서비스**: 내장 Ollama 어댑터는 OpenAI 호환 프로토콜을 사용합니다(`/api/chat` 네이티브 프로토콜 아님). 로컬 서버 구동 상태 및 CORS 설정(예: 환경변수 `OLLAMA_ORIGINS=*` 설정)을 확인하세요. 자세한 내용은 [Ollama 연결 문제 #174](https://github.com/fishjar/kiss-translator/issues/174)를 참고하세요.
- **외부 플러그인 서비스**: 테스트 전에 **인터페이스 플러그인** 메뉴에서 권한이 승인되었는지 확인하세요. 프로토콜이나 요청 본문을 수정하려면 플러그인 선언 규칙 또는 소스 코드를 수정하고 인스턴스를 업그레이드하세요.

### 설정에서 로컬 AI, 파일 번역, 플러그인 메뉴가 보이지 않는 이유는 무엇인가요?

- 이 고급 기능 메뉴는 현재 데스크톱 Chrome/Edge 및 Firefox 확장 프로그램 버전에서만 제공됩니다.
- 스토어 배포 버전을 사용하는 경우 스토어 심사 주기로 인해 현재 개발 브랜치의 최신 기능이 아직 반영되지 않았을 수 있습니다.
- 또한 사용 중인 기기의 브라우저 기능(예: WebGPU 미지원)이 부족하거나 로컬 모델이 다운로드되지 않은 경우 관련 버튼이 비활성화되거나 준비되지 않은 상태일 수 있습니다.

### 유저 스크립트에서 외부 서비스에 연결하고 설정 페이지를 열려면 어떻게 하나요?

- **교차 출처(CORS) 권한**: 유저 스크립트가 네트워크 요청을 보낼 때 스크립트 관리자 알림 창에서 해당 도메인에 대한 접근을 허용해야 합니다.
- **기능 제한**: 인터페이스 플러그인과 로컬 AI는 브라우저 확장 프로그램 전용 기능이며, 유저 스크립트에서는 지원되지 않습니다.
- **설정 페이지**: 온라인 [유저 스크립트 설정 페이지](https://fishjar.github.io/kiss-translator/options.html)에 직접 접속하여 설정할 수 있습니다.

## 향후 계획

본 프로젝트는 여가 시간에 개발되는 오픈 소스 프로젝트로 엄격한 일정이 없습니다. 커뮤니티의 기여와 PR 제출을 언제나 환영합니다!

- [x] **텍스트 일괄 전송**: 요청 전략을 최적화하여 번역 API 호출 횟수를 줄이고 성능을 개선합니다.
- [x] **서식 있는 텍스트 번역 강화**: 복잡한 페이지 구조와 서식 있는 텍스트 포맷의 정확한 번역을 지원합니다.
- [x] **고급 커스텀/AI 인터페이스 지원**: 스트리밍, 대화 문맥 기억, 다중 턴 대화 등 고급 AI 기능을 지원합니다.
- [x] **영어 사전 폴백 메커니즘**: 번역 서비스를 사용할 수 없을 때 로컬/내장 사전 검색으로 대체합니다.
- [x] **YouTube 자막 지원 개선**: 스트리밍 자막 병합 및 번역 경험을 개선하여 부자연스러운 문장 분할을 줄입니다.
- [x] **엣지 AI 컴퓨팅 지원**: 로컬 경량 LLM, VLM, ASR, OCR, TTS, JEV, 레이아웃 분석을 통한 번역 보조.
- [x] **문서 및 이미지 번역 지원**: TXT, Markdown, PDF, EPUB 및 PNG/JPEG/WebP 이미지 번역을 지원합니다.
- [ ] **분산 공유 플랫폼**: 자막, 규칙 등을 손쉽게 공유할 수 있는 분산 메커니즘을 도입합니다.
- [ ] **번역 Agent**: 심층적인 언어 문맥 이해 및 의사결정을 수행하는 자체 지능형 번역 Agent를 개발합니다.
- [ ] **현대적 아키텍처 리팩토링**: 기능 모듈을 재구성하고 최신 기술 스택으로 프로젝트를 리팩토링합니다.

위 방향에 관심이 있으시다면 언제든지 [Issues](https://github.com/fishjar/kiss-translator/issues)에서 토론하거나 PR을 제출해 주세요!

## 개발 가이드

### 로컬 빌드 및 디버깅

**환경 요구 사항**: Node.js >= 20(권장: Node 22/24), pnpm >= 9

```sh
# 1. 저장소 복제 및 dev 브랜치로 전환
git clone https://github.com/fishjar/kiss-translator.git
cd kiss-translator
git checkout dev # PR 제출 시 dev 브랜치 권장

# 2. 의존성 설치
pnpm install

# 3. 자주 사용하는 개발 및 빌드 명령어
pnpm build:chrome      # Chrome/Edge 확장 프로그램 빌드 (출력 경로: build/chrome)
pnpm build:firefox     # Firefox 확장 프로그램 빌드 (출력 경로: build/firefox)
pnpm start             # 웹 버전 로컬 개발 서버 실행 (http://localhost:3000)
pnpm check:pr          # PR 제출 전 코드 포맷 및 빌드 자체 검증
pnpm build             # 모든 플랫폼 대상 전체 빌드
```

### 브라우저에 확장 프로그램 로드하기 (Chrome / Edge 기준)

1. 브라우저를 열고 `chrome://extensions` (Edge는 `edge://extensions`)로 이동합니다.
2. 우측 상단의 **'개발자 모드'**를 활성화합니다.
3. **'압축해제된 확장 프로그램을 로드합니다'** 버튼을 클릭하고 프로젝트 루트의 `build/chrome` 폴더를 선택합니다.
4. 코드 수정 후 `pnpm build:chrome` 명령을 다시 실행한 다음, 확장 프로그램 관리 페이지에서 새로고침 아이콘을 클릭하면 변경사항이 반영됩니다.

플러그인 개발은 [플러그인 개발 가이드(중국어)](https://github.com/fishjar/kiss-translator-plugins/blob/main/docs/plugin-development-guide.md)를 읽어보시고 [OpenAI 호환 플러그인](https://github.com/fishjar/kiss-translator-plugins/blob/main/plugins/openai-compatible-bundle/README.md) 또는 [DeepSeek 플러그인](https://github.com/fishjar/kiss-translator-plugins/blob/main/plugins/deepseek/README.md)를 참고하세요.

### 외부 이벤트 호출 예시

웹페이지 스크립트에서 커스텀 이벤트를 발생시켜 번역기를 제어할 수 있습니다:

```js
// `toggle_translate`   웹페이지 번역 전환
// `toggle_styles`      번역 스타일 전환
// `toggle_popup`       제어 패널 열기/닫기
// `toggle_transbox`    독립 번역 팝업 열기/닫기
// `toggle_hover_node`  마우스 호버 단락 번역
// `input_translate`    현재 입력란 번역
window.dispatchEvent(
  new CustomEvent("kiss_translator", { detail: { action: "toggle_translate" } })
);
```

## 커뮤니티

- [Telegram 그룹](https://t.me/+RRCu_4oNwrM2NmFl) 참여

## 후원

KISS Translator가 도움이 되셨다면 지속적인 개발과 유지보수를 위해 후원해 주시면 감사하겠습니다!

![appreciate](https://github.com/fishjar/kiss-translator/assets/1157624/ebaecabe-2934-4172-8085-af236f5ee399)
