import { assign, createActor, setup } from "xstate";
import { speechstate } from "speechstate";
import { createBrowserInspector } from "@statelyai/inspect";
import { KEY, NLU_KEY } from "./azure.js";

const inspector = createBrowserInspector();

const azureLanguageCredentials = {
  endpoint: "https://m-v-lab3.cognitiveservices.azure.com/language/:analyze-conversations?api-version=2022-10-01-preview",
  key: NLU_KEY,
  deploymentName: "appointment",
  projectName: "appointment",
};

const azureCredentials = {
  endpoint: "https://northeurope.api.cognitive.microsoft.com/sts/v1.0/issuetoken",
  key: KEY,
};

const settings = {
  azureLanguageCredentials: azureLanguageCredentials,
  azureCredentials: azureCredentials,
  asrDefaultCompleteTimeout: 0,
  asrDefaultNoInputTimeout: 5000,
  locale: "en-US",
  ttsDefaultVoice: "en-US-DavisNeural",
};

const FamousPeople = {
  "Childish Gambino": {information:"Donald Glover, also known by his stage name Childish Gambino, is an American multi-talented artist who has made a significant impact in the entertainment industry."},
  "Marvin Gaye": {information:"is known as the Prince of Motown, was a legendary soul singer-producer-songwriter who fought for justice and equality in America."},
  "Anna Delvey": {information: "Anna Sorokin, commonly known as Anna Delvey, is a con artist who posed as a wealthy heiress to access upper-class New York social and art scenes. She became famous after her Netflix show called Finding Anna was released."},
  "Mick Jagger": {information: "Sir Michael Philip Jagger, more known as Mick Jagger, is the lead vocalist and one of the founders of The Rolling Stones, one of the longest-running and hugely successful bands ever."},
  "Stieg Larsson": {information: "Karl Stig-Erland (Stieg) Larsson was a Swedish journalist and writer, best known for writing the Millenium trilogy crime novels, one of which is The Girl with the Dragon Tattoo. His works became loved after his passing."},
  "Rosa Parks": {information: "Rosa Louise McCauley Parks was an American activist in the civil rights movement, best known for her pivotal role in the Montgomery bus boycott."},
  "Ella Fitzgerald": {information: "Ella Jane Fitzgerald, dubbed as the first lady of song, was the most popular female jazz singer in the United States for more than half a century."},
  "Corey Taylor": {information: "Corey Todd Taylor is the lead vocalist of the heavy metal bands Slipknot and Stone Sour, known for his powerful vocals and intense stage presence."},
  "Lea Salonga": {information: "Maria Lea Carmen Imutan Salonga is a Filipina singer and actress, also known as the singing voice of Disney's Jasmine and Mulan."},
};


const helloUser = ["Hello, is anyone there?", "Please say something"];
function randomRepeat(myarray){
  const randomIndex =  Math.floor(Math.random() * myarray.length);
    return myarray[randomIndex];
}
/* Helper functions */
function isInFamousPeople(utterance) {
  return utterance in FamousPeople;
}

function getFamousPeopleInf(utterance) {
  return (FamousPeople[utterance.toLowerCase()]|| {}).information;
}

function MeetingIntent(event) {
  return event === "Create a meeting";
}

function WhoIsXIntent(event) {
  return event === "Who is X";
}

const dmMachine = setup({
  actions: {
    listenUser: ({ context }) =>
      context.ssRef.send({
        type: "LISTEN",
        value: { nlu: true }
      }),

    speakUser: ({ context }, params) =>
      context.ssRef.send({
        type: "SPEAK",
        value: {
          utterance: params
        }
      })
  }
}).createMachine({
  context: {
    celebrity: "",
    meeting_time: "",
    meeting_hour: ""
  },
  id: "DM",
  initial: "Prepare",
  states: {
    Prepare: {
      entry: [
        assign({
          ssRef: ({ spawn }) => spawn(speechstate, { input: settings })
        }),
        ({ context }) => context.ssRef.send({ type: "PREPARE" })
      ],
      on: { ASRTTS_READY: "WaitToStart" }
    },
  
    WaitToStart: { //dito may mali dapat yellow
      after: {
        "1000": "Prompt"
      },
      on: {
        CLICK: "Prompt"
      }
    },
  
    Prompt: {
      initial: "Prompt1",
      states: {
        Prompt1: {
          entry: [{ type: "speakUser", 
          params: `Hi, what can I do for you?`,
        }],
      on: { SPEAK_COMPLETE: "Intents" },
    },
      Intents: {
      entry: "listenUser",
      on: {
        RECOGNISED: [
          {guard: ({event}) => event.nluValue.topIntent === "Create a meeting",
            target: "WithWhom"},

            {guard: ({event}) => event.nluValue.topIntent === "who is X" && isInFamousPeople(event.nluValue.entities[0].text),
            actions: assign({celebrity: ({event}) => event.nluValue.entities[0].text}),
            target: "Celebinfo",
          },
          {guard: ({event}) => event.nluValue.topIntent === "who is X", 
          target: "Nodata",
          actions: assign({celebrity: ({context, event}) => event.nluValue.entities[0].text}),
          },
      
        ],
        ASR_NOINPUT: "Noinput",
      },
  },
},
//who is x
        Celebinfo: {
          entry: [{
            type: "speakUser",
            params: ({context}) => `${getFamousPeopleInf(context.celebrity)}`
          }],  
          on: { SPEAK_COMPLETE: "#DM.Done" },
          },

          Nodata:{
            entry: [{
            type: "speakUser",
            params: `Can you ask for another celebrity, I don't have any data for the person you said.`,
          }],                     
          on: { SPEAK_COMPLETE: "#DM.Prompt.Prompt1" },

        },

        Unclear:{
          entry: [{
            type: "speakUser",
            params: `I'm sorry, can you please say something, it is unclear.`,
          }],                     
          on: { SPEAK_COMPLETE: "Intents" },
        },

        Noinput: {
          entry: ({context}) =>
                context.ssRef.send({
                    type: "SPEAK",
                    value: {
                        utterance: randomRepeat(helloUser),
                    },
                }),
                on: {
                    SPEAK_COMPLETE: "#DM.Prompt.Prompt1"
                },
            
            },


    //appointment 
        WithWhom: {
          after: {
            "3000": "#DM.Prompt.Prompt1"
          },  
          entry: [
            {
              type: "speakUser",
              params: `With whom would you like to have a meeting with?` //Marvin gaye is the one that is recognized the most
            }
          ],
          on: { SPEAK_COMPLETE: "ListenPersonMeet" }
        },

        ListenPersonMeet: {
          entry: "listenUser",
          on: {
            ASR_NOINPUT : "Reraise",
            RECOGNISED: {
              actions: 
              assign({
                celebrity: ({ event }) => event.nluValue.entities[0].text
                }),
              target: "Day"
            },
            ASR_NOINPUT: {
              target: "Didntunderstand"
            }
          }
        },

        ReRaise: {
          entry: [
            {
              type: "speakUser",
              params: `I didn't understand, can you repeat?`
            }
          ],
          on: { SPEAK_COMPLETE: "ListenPersonMeet" }
        },


        Didntunderstand: {
          entry: [
            {
              type: "speakUser",
              params: `I didn't understand, can you repeat?`
            }
          ],
          on: { SPEAK_COMPLETE: "WithWhom" }
        },

        Day: {
          after: {
            "3000": "#DM.Prompt.Prompt1"
          },   
            entry: [
              {
              type: "speakUser",
              params: `On which day would you like to have a meeting?`
              }
          ],
          on: {
            SPEAK_COMPLETE: "TimeHour"
          }
        },

        TimeHour: {
          entry: "listenUser",
          on: {
            RECOGNISED: {
              actions: assign({
                meeting_time: ({ event }) => event.nluValue.entities[0].text
              }),
              target: "Time"
            },
            ASR_NOINPUT: {
              target: "ReRaise1"
            }
          }
        },

        ReRaise1: {
          entry: [
            {
              type: "speakUser",
              params: `I didn't understand, can you repeat?`
            }
          ],
          on: { SPEAK_COMPLETE: "TimeHour" }
        },

        Time: {
          entry: [
            {
              type: "speakUser",
              params: `What time is the meeting going to take place?`
            }
          ],
          on: {
            SPEAK_COMPLETE: "ListenTime"
          }
        },

        ListenTime: {
          entry: "listenUser",
          on: {
            RECOGNISED: {
              actions: assign({
                meeting_hour: ({ event }) => event.nluValue.entities[0].text
              }),
              target: "Verification"
            },
            ASR_NOINPUT: {
              target: "ReRaise2"
            }
          }
        },

        ReRaise2: {
          entry: [
            {
              type: "speakUser",
              params: `I didn't understand, can you repeat?`
            }
          ],
          on: { SPEAK_COMPLETE: "ListenTime" }
        },

        Verification: {
          entry: [
            {
              type: "speakUser",
              params: ({ context }) =>
                `You want to create an appointment at ${context.meeting_hour} with ${context.celebrity} on ${context.meeting_time}, let's proceed.`
            }
          ],
          on: { SPEAK_COMPLETE: "ExtraInfo" }
        },



        ExtraInfo: {
          entry: [
            { 
              type: "speakUser", 
              params: ({ context }) =>
                isInFamousPeople(context.celebrity) ? 
                `In order to prepare your meeting with ${context.celebrity}, here is some information you would want to know. ${getFamousPeopleInf(context.celebrity)}` :
                `I don't have information about ${context.celebrity}.`
            }
          ],
          on: {
            SPEAK_COMPLETE: "Done"
          }
        },

        Done: {
          entry: [{ type: "speakUser", params: `Enjoy your meeting!`}
        ],
          on: { CLICK: "Prompt" }

        },}
      }
});

const dmActor = createActor(dmMachine, {
  inspect: inspector.inspect
}).start();

dmActor.subscribe((state) => {
  /* if you want to log some parts of the state */
});

export function setupButton(element) {
  element.addEventListener("click", () => {
    dmActor.send({ type: "CLICK" });
  });
  dmActor.getSnapshot().context.ssRef.subscribe((snapshot) => {
    element.innerHTML = `${snapshot.value.AsrTtsManager.Ready}`;
  });
}
