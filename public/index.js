var socket = new WebSocket((location.protocol == "http:" ? "ws://" : "wss://") + location.host);

const MessageHandler = {
  Error: {
    INVALID_USER_INPUT: ()=>{
      return;
    },
    INVALID_PIN: ()=>{
      new LoginPage(false);
      return new ErrorHandler("Invalid PIN");
    },
    INVALID_QUIZ_TYPE: ()=>{
      return new ErrorHandler("Sorry, this quiz is an unsupported gamemode.");
    },
    UNKNOWN: ()=>{
      return new ErrorHandler("An unknown error occured.");
    },
    INVALID_NAME: ()=>{
      clearTimeout(game.handshakeTimeout);
      new ErrorHandler("Invalid name.");
      return new LoginPage(true);
    },
    SESSION_NOT_CONNECTED: ()=>{
      new ErrorHandler("You can't reconnect yet; you haven't joined a game.");
    },
    EMPTY_NAME: ()=>{
      new ErrorHandler("No quiz name has been provided. The server will not search until this information is provided.");
    },
    HANDSHAKE: ()=>{
      clearTimeout(game.handshakeTimeout);
      new ErrorHandler("Connection to Kahoot's server was blocked. ¯\\_(ツ)_/¯");
      if(document.getElementById("handshake-fail-div")){
        document.getElementById("handshake-fail-div").outerHTML = "";
      }
      let url;
      switch (detectPlatform()) {
        case "Windows":
          url = "https://www.mediafire.com/file/ju7sv43qn9pcio6/kahoot-win-win.zip/file";
          break;
        case "MacOS":
          url = "https://www.mediafire.com/file/bcvxlwlfvbswe62/Kahoot_Winner.dmg/file";
          break;
        default:
          url = "https://www.mediafire.com/file/zb5blm6a8dyrwtb/kahoot-win-linux.tar.gz/file";
      }
      const div = document.createElement("div");
      div.innerHTML = `<span>Hmm, we seem to be having trouble on our end. Try <span class="mobihide">downloading our app or </span>pressing the report button below!</span>
      <br>
      <a class="mobihide" href="${url}" onclick="dataLayer.push({event:'download_app'})" target="_blank">Download App</a>
      <br>
      <button onclick="send({type:'HANDSHAKE_ISSUES',message:'AAAA!'});this.innerHTML = 'Issue has been reported.';this.onclick = null;" title="This button may decrease the amount of time to reset the server.">Report Issues</button>`;
      div.id = "handshake-fail-div";
      div.style = `
        position: fixed;
        top: 4rem;
        z-index: 1000;
        width: 100%;
        color: white;
        background: #888;
        text-align: center;
        border-radius: 5rem;
      `;
      document.body.append(div);
    }
  },
  Message: {
    SetName: name=>{
      const a = document.getElementById("loginInput").value = name;
    },
    PinGood: m=>{
      pin = m.match(/\d+/g)[0];
      if(pin != game.pin){
        game.pin = pin;
      }
      try{
        TutorialDiv.innerHTML = "";
      }catch(e){}
      return new LoginPage(true);
    },
    JoinSuccess: data=>{
      data = JSON.parse(data);
      game.cid = data.cid;
      game.quizEnded = false;
      dataLayer.push({event:"join_game"});
      activateLoading(false,false);
      clearTimeout(game.handshakeTimeout);
      return new LobbyPage;
    },
    QuizStart: name=>{
      try{
        const n = JSON.parse(name).name;
        game.quizName = n;
        new ErrorHandler("Playing: " + n,true);
      }catch(err){}
      return new QuizStartPage;
    },
    QuestionGet: info=>{
      const data = JSON.parse(info);
      return new GetReadyPage(data);
    },
    QuestionBegin: question=>{
      return new QuestionAnswererPage(question);
    },
    QuestionSubmit: message=>{
      return new QuestionSnarkPage(message);
    },
    QuestionEnd: info=>{
      return new QuestionEndPage(info);
    },
    QuizFinish: info=>{
      game.quizEnded = true;
      game.end.info = JSON.parse(info);
      dataLayer.push(Object.assign({event:"quiz_finish"},JSON.parse(info)));
    },
    FinishText: text=>{
      return new QuizEndPage(text);
    },
    QuizEnd: ()=>{
      game.quizEnded = true;
      resetGame();
      return setTimeout(function(){new ErrorHandler("Quiz ended or kicked.");},300);
    },
    RunTwoSteps: ()=>{
      game.two = [];
      return new TwoStepPage;
    },
    Ping: ()=>{
      console.log("Recieved ping from server");
    },
    FailTwoStep: ()=>{
      return new TwoStepPage(true);
    },
    TwoStepSuccess: ()=>{
      return new LobbyPage;
    },
    Maintainance: msg=>{
      return new ErrorHandler("Maintainance Alert: " + msg);
    }
  }
};

socket.onmessage = evt=>{
  evt = evt.data;
  let data = JSON.parse(evt);
  if(data.type == "Error"){
    return MessageHandler.Error[data.message]();
  }
  eval(`MessageHandler.${data.type}("${data.message.replace(/\\/img,"\\\\").replace(/"/img,"\\\"")}")`);
};

socket.onclose = ()=>{
  new ErrorHandler("Session disconnected.");
  // attempt to reconnect
  activateLoading(true,true,"<br><br><br><br><p>Reconnecting</p>");
  function check(t){
    const x = new XMLHttpRequest();
    x.open("GET","/up");
    x.send();
    x.onerror = x.ontimeout = function(){
      t *= 2;
      if(t > 30){
        t = 30;
      }
      setTimeout(function(){
        check(t);
      },t * 1000);
    };
    x.onload = function(){
      activateLoading(false,false);
      if(!game.quizEnded && game.pin[0] != "0"){
        resetGame(true);
      }else{
        resetGame();
      }
    }
  }
  check(0.5);
};

class Game{
  constructor(){
    this.oldQuizUUID = "";
    this.name = "";
    this.cid = "";
    this.pin = 0;
    this.score = 0;
    this.answers = [];
    this.quizEnded = true;
    this.total = 0;
    this.index = 0;
    this.end = {};
    this.two = [];
    this.errorTimeout = null;
    this.jumbleAnswer = [];
    this.multiAnswer = {
      0: false,
      1: false,
      2: false,
      3: false
    };
    this.theme = "Kahoot";
    this.opts = {};
    this.correctIndex = null;
  }
  sendPin(pin){
    this.pin = pin;
    send({type:"SET_PIN",message:pin});
    activateLoading(true,true);
  }
  join(name){
    this.name = name;
    send({type:"JOIN_GAME",message:name});
    activateLoading(true,true);
    this.handshakeTimeout = setTimeout(()=>{
      if(document.getElementById("handshake-fail-div")){
        document.getElementById("handshake-fail-div").outerHTML = "";
      }
      MessageHandler.Error.HANDSHAKE();
      let url;
      switch (detectPlatform()) {
        case "Windows":
          url = "https://www.mediafire.com/file/ju7sv43qn9pcio6/kahoot-win-win.zip/file";
          break;
        case "MacOS":
          url = "https://www.mediafire.com/file/bcvxlwlfvbswe62/Kahoot_Winner.dmg/file";
          break;
        default:
          url = "https://www.mediafire.com/file/zb5blm6a8dyrwtb/kahoot-win-linux.tar.gz/file";
      }
      const div = document.createElement("div");
      div.innerHTML = `<span>Hmm, we seem to be having trouble on our end. Try downloading our app!</span>
      <br>
      <a href="${url}" onclick="dataLayer.push({event:'download_app'})" target="_blank">Download App</a>`;
      div.className = "shortcut";
      div.id = "handshake-fail-div";
      div.style = `
        position: fixed;
        top: 4rem;
        z-index: 1000;
        width: 100%;
        color: white;
        background: #888;
        text-align: center;
        border-radius: 5rem;
      `;
      document.body.append(div);
    },10000);
  }
  getRandom(){
    dataLayer.push({event:"get_random_name"});
    send({type:"GET_RANDOM_NAME",message:"please?"});
  }
  saveOptions(){
    const settings = SettingDiv.querySelectorAll("input,select");
    const opts = {};
    for(let i = 0;i<settings.length;++i){
      opts[settings[i].id] = settings[i].type == "checkbox" ? settings[i].checked : settings[i].value;
    }
    localStorage.options = JSON.stringify({
      manual: opts.manual,
      timeout: opts.timeout,
      brute: opts.brute,
      fail: opts.fail,
      teamMembers: opts.teamMembers,
      theme: opts.theme,
      previewQuestion: opts.previewQuestion,
      searchLoosely: opts.searchLoosely,
      ChallengeDisableAutoplay: opts.ChallengeDisableAutoplay,
      div_game_options: opts.div_game_options,
      div_search_options: opts.div_search_options,
      div_challenge_options: opts.div_search_options
    });
    game.opts = opts;
    send({type:"SET_OPTS",message:JSON.stringify(opts)});
  }
  loadOptions(){
    let opts;
    try{
      opts = JSON.parse(localStorage.options);
      game.opts = opts;
    }catch(err){
      return;
    }
    if(!opts){
      return;
    }
    for(let i in opts){
      const elem = document.getElementById(i);
      if(elem.type == "checkbox"){
        elem.checked = opts[i];
      }else{
        elem.value = opts[i];
      }
    }
    if(socket.readyState === 1){
      game.saveOptions();
      dataLayer.push(Object.assign({event:"load_options"},opts));
      return new ErrorHandler("Restored Options!",true);
    }else{
      setTimeout(()=>{
        game.loadOptions();
      },3000);
    }
  }
  answer(num){
    activateLoading(true,true);
    send({type:"ANSWER_QUESTION",message:num});
    dataLayer.push({
      event: "answer",
      value: num,
      type: this.question.type
    });
  }
  answer2(id,thing){
    thing.className = "faded";
    if(this.two.indexOf(id) != -1){
      return;
    }
    this.two.push(id);
    if(this.two.length == 4){
      send({type:"DO_TWO_STEP",message:JSON.stringify(this.two)});
      activateLoading(true,true,"");
      return;
    }
  }
  answerJ(id,thing){
    if(this.jumbleAnswer.indexOf(id) != -1){
      return;
    }
    this.jumbleAnswer.push(id);
    thing.src = "resource/step" + (this.jumbleAnswer.length) + ".svg";
    thing.className = "faded correct";
  }
  answerM(id,thing){
    this.multiAnswer[id] = !this.multiAnswer[id];
    if(thing.className.indexOf("correct") != -1){
      thing.className = this.multiAnswer[id] ? "fadedm correct" : "correct";
    }else{
      thing.className = this.multiAnswer[id] ? "fadedm" : "";
    }
  }
}

function send(message){
  socket.send(JSON.stringify(message));
}

let game = new Game;
let egg = "";
const eggstyle = document.createElement("style");
eggstyle.innerHTML = `p,.sm span,img,h1,h2,.About h3,.tut_cont h3,h4{
  animation: infinite windance 1s;
}`;
window.addEventListener("load",()=>{
  game.loadOptions();
  game.theme = ThemeChooser.value;
  if(game.theme != "Kahoot"){
    new LoginPage;
  }
  if(game.theme == "Rainbow"){
    SettingDiv.className = "rainbow correct";
    document.querySelector(".About").className = "About rainbow";
  }
});
window.addEventListener("keydown",e=>{
  if(e.key == "Escape"){
    if(closePage == 0){
      SettingSwitch.click();
    }else if (closePage == 1) {
      AboutSwitch.click();
    }else{
      ChangelogSwitch.click();
    }
  }
  egg += e.key;
  try{
    if("winner".search(egg) != 0){
      egg = "";
      try{
        document.body.removeChild(eggstyle);
      }catch(err){
        // meh
      }
    }else if(egg == "winner"){
      document.body.append(eggstyle);
    }
  }catch(err){
    egg = "";
  }
});

function detectPlatform(){
  let OSName = "Linux";
  if (navigator.appVersion.indexOf("Win")!=-1) OSName="Windows";
  if (navigator.appVersion.indexOf("Mac")!=-1) OSName="MacOS";
  if (navigator.appVersion.indexOf("X11")!=-1) OSName="UNIX";
  if (navigator.appVersion.indexOf("Linux")!=-1) OSName="Linux";
  return OSName;
}
