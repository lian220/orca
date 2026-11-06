# Orca Lian upstream/main 반영 — 테스트 케이스

- 근거: 사용자 요청(공식 upstream/main 반영·재빌드·실행, 공식 Orca와 Orca Lian만 유지).
- 입구: 설치 앱, 번들 CLI, Hermes ACP 대화, Electron 렌더러.
- 준비: 기존 대화·인증 프로필 보존, 이 맥북 독립 실행용 ad-hoc 서명. 외부 게시·메시지 전송 없음.

| ID  | 입력                                                                  | 기대 결과                                                                         |
| --- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| C1  | upstream/main 87788aeae5f 병합 후 타입 검사와 기존 Hermes 회귀 테스트 | upstream/main이 조상이며 개인 ACP·대기열·CLI 경로 테스트 통과                     |
| C2  | 공식 배포 앱 서명·버전 조회                                           | com.stablyai 계열 공식 서명과 1.4.250 확인, 원본 서명 변조 없음                   |
| C3  | Orca Lian 패키징 및 codesign 검증                                     | com.lian.orca.lian, upstream/main의 버전, 명시한 ad-hoc 서명, 심층 서명 검증 통과 |
| C4  | 설치된 Orca Lian 실행 및 번들 CLI 상태 조회                           | 앱 초기화 완료, orca-lian 데이터 경로와 app.running 확인                          |
| C5  | 시험 작업공간의 Hermes에 고유 시험 문구 및 읽기 전용 호스트 조회 요청 | 응답 완료, 도구 결과 존재, 기존 대화·예약 변경 없음                               |
| C6  | Applications 앱 목록 조회                                             | 공식 Orca와 Orca Lian만 존재, Orca Hermes·Supervisor 설치본 없음                  |
