/**
 * Javascript functions for emscripten http transport for nodejs and the browser NOT using a webworker
 * 
 * If you can't use a webworker, you can build Release-async or Debug-async versions of wasm-git
 * which use async transports, and can be run without a webworker. The lg2 release files are about
 * twice the size with this option, and your UI may be affected by doing git operations in the
 * main JavaScript thread.
 * 
 * This the non-webworker version (see also post.js)
 */

const emscriptenhttpconnections = {};
let httpConnectionNo = 0;

const chmod = FS.chmod;
    
FS.chmod = function(path, mode, dontFollow) { 
    if (mode === 0o100000 > 0) {
        // workaround for libgit2 calling chmod with only S_IFREG set (permisions 0000)
        // reason currently not known
        return chmod(path, mode, dontFollow);
    } else {
        return 0;
    }
};

 Module.origCallMain = Module.callMain;
 Module.callMain = async (args) => {
   await Module.origCallMain(args);
   if (typeof Asyncify === "object" && Asyncify.currData) {
     await Asyncify.whenDone();
   }
 };

 Object.assign(Module, {
   emscriptenhttpconnect: async function (url, buffersize, method, headers) {
     let result = new Promise((resolve, reject) => {
       if (!method) {
         method = "GET";
       }

       const xhr = new XMLHttpRequest();
       xhr.open(method, url, true);
       xhr.responseType = "arraybuffer";

       if (headers) {
         Object.keys(headers).forEach((header) =>
           xhr.setRequestHeader(header, headers[header])
         );
       }

       emscriptenhttpconnections[httpConnectionNo] = {
         xhr: xhr,
         resultbufferpointer: 0,
         buffersize: buffersize,
       };

       if (method === "GET") {
         xhr.onload = function () {
           resolve(httpConnectionNo++);
         };
         xhr.send();
       } else {
         resolve(httpConnectionNo++);
       }
     });
     return result;
   },
   emscriptenhttpwrite: function (connectionNo, buffer, length) {
     const connection = emscriptenhttpconnections[connectionNo];
     const buf = new Uint8Array(Module.HEAPU8.buffer, buffer, length).slice(0);
     if (!connection.content) {
       connection.content = buf;
     } else {
       const content = new Uint8Array(connection.content.length + buf.length);
       content.set(connection.content);
       content.set(buf, connection.content.length);
       connection.content = content;
     }
   },
   emscriptenhttpread: async function (connectionNo, buffer, buffersize) {
     const connection = emscriptenhttpconnections[connectionNo];

     function handleResponse(connection, buffer, buffersize) {
       let bytes_read =
         connection.xhr.response.byteLength - connection.resultbufferpointer;
       if (bytes_read > buffersize) {
         bytes_read = buffersize;
       }
       const responseChunk = new Uint8Array(
         connection.xhr.response,
         connection.resultbufferpointer,
         bytes_read
       );
       writeArrayToMemory(responseChunk, buffer);
       connection.resultbufferpointer += bytes_read;
       return bytes_read;
     }

     let result = new Promise((resolve) => {
       if (connection.content) {
         connection.xhr.onload = function () {
           resolve(handleResponse(connection, buffer, buffersize));
         };
         connection.xhr.send(connection.content.buffer);
         connection.content = null;
       } else {
         resolve(handleResponse(connection, buffer, buffersize));
       }
     });

     return result;
   },
   emscriptenhttpfree: function (connectionNo) {
     delete emscriptenhttpconnections[connectionNo];
   },
 });