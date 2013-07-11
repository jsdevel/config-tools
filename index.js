/*!
 * Copyright 2013 Joseph Spencer.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
var logger = new Logger('config-tools');
var log = logger.log;
var err = logger.error;
module.exports = {
   /** find a config file, starting in the user's directory searching upward if
    * necessary searching for the file in all config directories.
    *
    * @param {Array|string} configFileName
    * @param {function(Object)} fnFound
    * @param {function(string, Logger, boolean)} fnNotFound
    * @param {number=} maxTimesToCall
    */
   getConfig:function(configFileName, fnFound, fnNotFound, maxTimesToCall){
      var CWD = process.cwd();
      var configs = [];
      var hasMissingConfig = false;
      var len,i;
      var isFnFoundAFunction = typeof fnFound === 'function';
      var isFnNotFoundAFunction = typeof fnNotFound === 'function';

      if(!isFnFoundAFunction && !isFnNotFoundAFunction){
         err("No callback specified.  You must specify a callback.");
         return;
      }

      if(!isFnFoundAFunction){
         fnFound = function(fileName, logger){
            logger.warn("The config file: '"+fileName+"' was found, "+
               "but no callback was registered for this event."
            );
         };
      }

      if(!isFnNotFoundAFunction){
         fnNotFound = function(fileName, logger){
            logger.warn("The config file: '"+fileName+"' wasn't found, "+
               "and no callback was registered for this event."
            );
         };
      }

      if(!configFileName){
         err(
            "No configFileName given.  configFileName must be an array, or"+
            " a string."
         );
         return;
      }

      if(configFileName instanceof Array){
         len = configFileName.length;
         if(!len){
            err(
               "No configFileNames in array."
            );
            return;
         }
         configs.length = len;
         for(i=0;i<len;i++){
            getConfig(
               CWD,
               getFileName(configFileName[i]),
               (function(i){
                  var j;
                  return function(result){
                     configs[i] = result;
                     if(i+1 === len){
                        if(hasMissingConfig){
                           err("Aborting because there were missing configs: ");
                           err(configs);
                           return;
                        } else {
                           for(j=0;j<len;j++){
                              if(!configs[j]){
                                 return;
                              }
                           }
                           fnFound.apply(fnFound, configs);
                        }
                     }
                  };
               })(i),
               (function(i){
                  return function(fileName, logger, isFound){
                     configs[i] = null;
                     hasMissingConfig = true;
                     fnNotFound(fileName, logger, !!isFound);
                  };
               })(i)
            );
         }
      } else {
         getConfig(
            CWD,
            getFileName(configFileName),
            fnFound,
            fnNotFound,
            maxTimesToCall
         );
      }
   }
};
/**
 * Scans a directory upwards through all ancestor directories if necessary
 * searching for a config file within a config directory directory.
 *
 * @param {string} baseDir The base directory to begin the search.
 * @param {string} fileName The name of the config file to search for.  Config
 * files end in ".json$".
 * @param {function(string,Object)} fnFound Accepts the absolute path of the
 * config file, and the resulting config JSON object.
 * @param {function(string)} fnNotFound Accepts the absolute path of the config
 * file.
 * @param {number} timesCalled When getConfig searches in more directories than
 * this number, fnNotFound is called and the process stops.  The default value
 * if 50.
 */
function getConfig(baseDir, fileName, fnFound, fnNotFound, timesCalled){
   var path = require('path');
   var fs   = require('fs');
   var pathToConfigDir = path.join(baseDir, 'config');
   var pathToConfig = path.join(pathToConfigDir, fileName);
   var configObj;
   fs.stat(pathToConfig, function(e){
      var i = (typeof timesCalled === 'number') ? timesCalled + 1 : 0;
      var isFound=false;
      if(e){
         switch(e.errno){
         case 34:
            if(i > 50){
               err(
                  "Couldn't find 'config/"+fileName+"' in any parent directory."
               );
               break;
            }
            getConfig(path.dirname(baseDir), fileName, fnFound, fnNotFound, i);
            return;
         default:
            err("The following error occurred while trying to find: "+
            path.join(baseDir, fileName)+".  Exiting...");
            err(e);
         }
      } else {
         isFound=true;
         try {
            configObj = require(pathToConfig);
            if(
               configObj &&
               handleCallbackSafely(fnFound, {
                  dir:pathToConfigDir,
                  path:pathToConfig,
                  config:configObj,
                  logger:new Logger(fileName, configObj)
               })
            ){
               return;
            }
         } catch(e){
            err(pathToConfig+" was found, but the following error occurred "+
            "while parsing it's contents:\n"+e);
         }
      }
      handleCallbackSafely(fnNotFound, fileName, new Logger(fileName), isFound);
   });
}

/**
 *
 * @param {function()} fn
 * @returns {boolean} Indicates that no error ocurred if true
 */
function handleCallbackSafely(fn){
   var args;
   try {
      args = Array.prototype.slice.call(arguments).splice(1);
      fn.apply(fn, args);
      return true;
   } catch(e){
      err(
         "The following error occurred while executing the callback: "+e
      );
      return false;
   }
}

/**
 *
 * @param {string} name
 * @returns {string}
 */
function getFileName(name){
   if(!name){
      return '';
   }
   return /\.json$/i.test(name) ?
                  name :
                  name + ".json";
}

function Logger(name, obj){
   var logging;
   var instance=this;
   name = (""+name).replace(/.json$/, "");
   this.debug=function(){};
   this.error=function(msg){
      instance.log("ERROR - "+msg);
   };
   this.info=function(msg){
      instance.log("INFO  - "+msg);
   };
   this.warn=function(msg){
      instance.log("WARN  - "+msg);
   };

   if(obj && typeof obj === 'object' && obj.logging){
      logging = obj.logging;
      if(!!logging.debug){
         this.debug=function(msg){
            instance.log("DEBUG - "+msg);
         };
      }
      if((typeof logging.error === 'boolean') && !logging.error){
         this.error=function(){};
      }
      if((typeof logging.info === 'boolean') && !logging.info){
         this.info=function(){};
      }
      if((typeof logging.warn === 'boolean') && !logging.warn){
         this.warn=function(){};
      }
   }
   this.log=function(msg){
      console.log(name+": "+msg);
   };
}
