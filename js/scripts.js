function waitForElement(elementPath, callBack){
    if (document.querySelector(elementPath) != null){
        callBack(elementPath, document.querySelector(elementPath));
    } else {
        setTimeout(function(){
            waitForElement(elementPath, callBack);
        }, 50);
    }
}

var footer = "";

//load our wasm file
const go = new Go();
WebAssembly.instantiateStreaming(fetch("https://assets.x70.dev/main.wasm"), go.importObject).then((result) => {
  go.run(result.instance);
  footer = footer + "<a id=wasmFooter></a>";
  document.getElementById("footer").innerHTML = footer;
});

waitForElement("#wasmFooter", function(){
    try {
      document.getElementById("footer").innerHTML = getFooter();
    } catch (error) {
      console.log(error);
      console.log("Error getting go footer. Defaulting to static footer.");
      document.getElementById("footer").innerHTML = footer;
    }

    var gitHubLink = document.getElementById("gitHubLink");
    gitHubLink.onclick = function() {
        window.open("https://github.com/zroulston/x70.dev", "_blank");
    }
    //Fetch the disclaimer
    try {
      document.getElementById("disclaimerModal").innerHTML = getDisclaimer();
    } catch (error) {
      console.log(error);
      console.log("Error getting go disclaimer.");
    }    
});

waitForElement("#span", function(){
  var modal = document.getElementById("disclaimerModal");
  var link = document.getElementById("disclaimerLink");
  var span = document.getElementsByClassName("close")[0];
     link.onclick = function() {
    modal.style.display = "block";
    return false;
  }
  
  span.onclick = function() {
    modal.style.display = "none";
  }
  
  window.onclick = function(event) {
    if (event.target == modal) {
      modal.style.display = "none";
    }
}
});
