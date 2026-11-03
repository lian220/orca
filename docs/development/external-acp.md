# 외부 ACP 에이전트 등록 (개발 빌드)

이 기능은 공식 릴리스가 아닌 `feat/external-acp-registration` 개발 브랜치에 있다. 공식 앱과 별도 사용자 데이터로 실행한다. 앱 파일·기존 대화 DB를 복사하거나 덮어쓰지 않는다.

## 등록 계약

사용자 소유의 일반 JSON 파일을 만들고 macOS/Linux에서는 권한을 `0600`으로 설정한다. macOS/Linux에서는 심볼릭 링크도 거절한다. Windows의 ACL·reparse-point 보호는 이 구현에서 검증하지 않았으며 동등한 보호를 보장하지 않는다. 신뢰한 실행 파일만 등록한다. 등록한 프로그램은 현재 사용자 권한으로 실행되므로 등록 파일과 실행 파일을 보호해야 한다.

```json
{
  "version": 1,
  "agents": [
    {
      "agent": "team-agent",
      "command": "/absolute/path/to/trusted-acp-launcher",
      "args": []
    }
  ]
}
```

- `agent`: 고유한 구조화 에이전트 ID. 내장 에이전트 ID와 충돌하거나 같은 ID가 두 번 있으면 전체 외부 등록을 거절한다.
- `command`: 절대 실행 경로. 셸 명령문을 넣지 않는다. `args`는 그대로 전달하는 문자열 배열이다.
- 환경변수·토큰은 이 파일에 넣지 않는다. 인증은 실행기의 기존 안전한 저장 경로에서 처리한다.
- 파일 경로는 `ORCA_EXTERNAL_ACP_CONFIG`로 지정한다. 앱 시작 시 읽으므로 변경 후 개발 앱을 재시작한다.
- 오류가 있으면 내장 에이전트는 유지되고 외부 등록만 비활성화된다. 로그에는 원문 대신 고정 오류만 기록한다.
- 명령·인자를 변경하면 연결 식별자가 바뀐다. 기존 대화를 다른 실행기로 조용히 재개하지 않는다.

## 별도 개발 앱 실행

소스 디렉터리에서 의존성을 설치하고 다음처럼 실행한다. 경로는 해당 컴퓨터의 절대 경로로 바꾼다.

```sh
pnpm install --frozen-lockfile
ORCA_BACKGROUND_LAUNCH=1 \
ORCA_DEV_USER_DATA_PATH=/absolute/private/orca-dev-profile \
ORCA_EXTERNAL_ACP_CONFIG=/absolute/private/agents.json \
pnpm dev
```

개발 앱 설정 → 실험적 → Chat UI를 켜고, 프로젝트 작업 공간의 새 탭에서 등록한 에이전트를 선택한다. 일반 채팅의 전송·취소·기록·재개 경로를 사용한다. 외부 에이전트는 터미널 전용 에이전트 목록에 추가되지 않는다.

## Hermes 연결 경계

맥북2 개발 환경은 `hermes` ID에 기존 `lian-hermes-local-acp` 연결 실행 파일을 등록한다. 이름에 local이 있어도 실제 연결 대상은 실행 파일이 고정한 맥미니 Hermes다. UI와 등록 계층은 모델·실행기를 결정하지 않는다. 기존 맥미니 Hermes가 내부 Jev를 사용하고 기존 실행기·브라우저 브리지를 호출한다.

이 기능은 특정 Hermes 구현을 Orca에 복제하지 않는다. 다른 ACP 서버도 고유 ID와 실행 파일로 등록할 수 있다. 모델·사용 가능한 모드는 연결된 서버가 보고하며, 별도의 모델 탐색 세션을 만들지 않는다.

개발 앱의 새 대화와 기존 공식 앱의 결제 대화는 서로 다른 기록이다. 원래 결제 세션 이관은 이 등록 기능만으로 자동 수행되지 않는다. 공식 앱의 DB를 개발 앱으로 덮어쓰지 않는다.

## 검증

시험 입력과 기대 결과: [실제 시험 케이스](../test-cases/20261028-external-acp.md).

```sh
pnpm tc
pnpm check:changed --maxWorkers=2
```

공식 릴리스 편입·배포는 별도 절차다. 개발 빌드를 사용한다고 공식 업데이트에 이 기능이 포함되는 것은 아니다.
