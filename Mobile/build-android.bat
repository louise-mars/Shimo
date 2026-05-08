@echo off
set "JAVA_HOME=C:\Program Files\Android\Android Studio\jbr"
set "PATH=%JAVA_HOME%\bin;%PATH%"
echo JAVA_HOME=%JAVA_HOME%
echo Building Debug APK...
cd /d c:\kiro\NotePro\Mobile\android
call gradlew.bat assembleDebug
