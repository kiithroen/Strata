@echo off
chcp 949 >nul
setlocal
cd /d "%~dp0"

rem Strata 개발 서버를 띄우고 브라우저로 연다. 이 파일은 CP949 로 저장한다(cmd 가 UTF-8 배치 파일을 잘못 읽는다).
rem 사용: run.bat            (우주 보기, 메모 앨범)
rem       run.bat explorer   (로컬 탐색기)
set "PAGE=/"
if not "%~1"=="" set "PAGE=/?w=%~1"
set "URL=http://localhost:5173%PAGE%"

where npm >nul 2>nul
if errorlevel 1 (
  echo Node.js 가 없습니다. https://nodejs.org 에서 LTS 버전을 설치한 뒤 다시 실행하세요.
  pause
  exit /b 1
)

if not exist node_modules (
  echo 처음 실행이라 필요한 패키지를 설치합니다...
  call npm install
  if errorlevel 1 (
    echo 패키지 설치에 실패했습니다.
    pause
    exit /b 1
  )
)

rem 이미 개발 서버가 떠 있으면 브라우저만 연다
netstat -ano | findstr /r /c:":5173 .*LISTENING" >nul
if not errorlevel 1 (
  echo 개발 서버가 이미 실행 중입니다. %URL% 을 엽니다.
  start "" "%URL%"
  exit /b 0
)

echo 개발 서버를 시작합니다. 끄려면 이 창에서 Ctrl+C 를 누르세요.
echo 폴더 고르기는 크롬·엣지에서만 됩니다.
call npm run dev -- --open "%PAGE%"
pause
