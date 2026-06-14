from pydantic import BaseModel
from langchain_openai import ChatOpenAI
from dotenv import load_dotenv;
from langgraph.graph import StateGraph, MessagesState, START, END

load_dotenv()


class MessagesStates(BaseModel):
     query:str
     llm_result:str
     accuracy:str
     is_coding:bool

routing_llm = ChatOpenAI(model="gpt-4.1-nano")

coding_llm_model = ChatOpenAI(model="gpt-4.1")

non_coding_llm_model = ChatOpenAI(model="gpt-4.1-mini")

final_llm_model = ChatOpenAI(model="gpt-4.1")

SYSTEM_PROMPT_ROUTING="""

     You are an helpful AI assistant , you will be getting user query you have to classify them in if query is related to coding then gave is_coding as  true either false
"""

SYSTEM_PROMPT_NON_CODING="""

     You are an helpful AI assistant , you will be getting user query you have to reply it in best way 
"""

SYSTEM_PROMPT_FINAL_CODING="""

     You are an helpful AI assistant , you will be getting user query and previous ai response based on user query and previous ai response suggest accuracy of it if accuracy is abve 95 percent send a variable accuracy and add percentage to it 
"""
def routing(state):
     structured_llm = routing_llm.with_structured_output(MessagesStates)
     response = structured_llm.invoke(
               [
                    {"role":"system","content":SYSTEM_PROMPT_ROUTING},
                    {"role":"user","content":state.query}
                ]
            )
     print("in routing -->",response)
     state.is_coding=response.is_coding
     return state


    
def non_coding_llm(state):
      response = non_coding_llm_model.invoke(
                [
                    {"role":"system","content":SYSTEM_PROMPT_NON_CODING},
                    {"role":"user","content":state.query}
                ]
            )
      print("in non coding llm-->",response)
      state.llm_result=response.content
      return state


def coding_llm(state):
      response = coding_llm_model.invoke(
               [
                    {"role":"system","content":SYSTEM_PROMPT_NON_CODING},
                    {"role":"user","content":state.query}
                ]
            )
      print("in coding -->",response)
      state.llm_result=response.content
      return state

def final_llm(state):
       structured_llm = final_llm_model.with_structured_output(MessagesStates)
       response = structured_llm.invoke(
          [
                    {"role":"system","content":SYSTEM_PROMPT_FINAL_CODING},
                    {"role":"user","content":state.query},
                    {"role":"ai","content":state.llm_result}
                ]
             )
       print("final validation -->",response)
       state.accuracy=response.accuracy
       return state
def conditional_reroute(state):
     if not state.accuracy:
        return "FALSE"
     value =int(state.accuracy.replace("%", ""))
     if value < 97:
        return False
     return True

graph = StateGraph(MessagesStates)
graph.add_node("routing",routing)
graph.add_node("non_coding_llm",non_coding_llm)
graph.add_node("coding_llm",coding_llm)
graph.add_node("final_llm",final_llm)
graph.add_edge(START, "routing")
graph.add_conditional_edges(
"routing",
lambda MessagesStates: "coding_llm" if MessagesStates.is_coding else "non_coding_llm"
)
graph.add_edge("coding_llm", "final_llm")
graph.add_edge("final_llm", END)
graph.add_conditional_edges(
"non_coding_llm",
conditional_reroute,{
       "TRUE": "coding_llm",
        "FALSE": END
}
)
graph.add_edge("non_coding_llm", END)
app=graph.compile()

def main():
  query = input("> ")
  initial_state = MessagesStates(
        query=query,
        llm_result="",
        accuracy="",
        is_coding=False
    )
  for event in app.stream(initial_state):
       print("Event",event)
#   result = graph.invoke(initial_state)
#   print("result",result["llm_result"])
  
main()